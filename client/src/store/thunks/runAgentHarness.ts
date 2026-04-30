import { createAsyncThunk } from "@reduxjs/toolkit";
import { upload as uploadInsightAsset } from "@semoss/sdk";
import { parseTranscriptMessage } from "@/lib/parseTranscriptMessage";
import {
  createSetRoomForInsightPixel,
  sanitizeInsightFilePath,
  sanitizePixelArg,
} from "@/lib/pixelHelpers";
import type { StreamingResponse } from "@/contexts/AppContext";
import {
  type PendingAttachment,
  selectEffectiveSystemPrompt,
  type ChatState,
  updateConversationRoomName,
} from "../slices/chatSlice";
import type { MCPState } from "../slices/mcpSlice";
import { addTranscriptEvent } from "../slices/transcriptSlice";

type RunPixelFn = <T = unknown>(pixelString: string | string[]) => Promise<T>;
type RunPixelAsyncFn = (pixelString: string) => Promise<{ jobId: string }>;
type GetPixelAsyncResultFn = <O extends unknown[] | []>(
  jobId: string,
) => Promise<{
  errors: string[];
  insightId: string;
  results: {
    isMeta: boolean;
    operationType: string[];
    output: O[number];
    pixelExpression: string;
    pixelId: string;
    additionalOutput?: unknown;
    timeToRun: number;
  }[];
}>;
type GetPixelJobStreamingFn = (jobId: string) => Promise<StreamingResponse>;

interface MCPDetails {
  id: string;
  name: string;
  type: string;
}

type UploadedRoomAttachment = {
  attachmentId: string;
  promptId: string;
  fileName: string;
  mimeType: string;
  path: string;
  timestamp: string;
};

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "image.png";

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Unable to prepare image upload.");
  }
  return response.blob();
};

const getUploadFileExtension = (fileName: string, mimeType: string) => {
  const extensionFromName = sanitizeFileName(fileName)
    .split(".")
    .pop()
    ?.trim();
  if (extensionFromName) {
    return extensionFromName;
  }
  const extensionFromMimeType = mimeType.split("/")[1]?.trim();
  return sanitizeFileName(extensionFromMimeType || "png");
};

const createUpdateRoomOptionsPixel = (
  roomId: string,
  instructions: string,
  mcps: MCPDetails[],
  model: string,
  harnessType: ChatState["harnessType"],
  targetProjectId?: string,
) => {
  const safeInstructions = sanitizePixelArg(instructions);
  const mcpStrings = mcps.map(
    (mcp) => `{'id':'${mcp.id}','name':'${mcp.name}','type':'${mcp.type}'}`,
  );
  const targetProjectPart = targetProjectId
    ? `, "targetProjectId":'${sanitizePixelArg(targetProjectId)}'`
    : "";
  return `UpdateRoomOptions(roomId='${roomId}', roomOptions=[{"instructions":'${safeInstructions}', "modelId":'${model}', "harnessType":'${harnessType}', "mcp":[${mcpStrings.join(",")}]${targetProjectPart} }] )`;
};

const createEnsureRoomInsightBoundPixel = (
  roomId: string,
  instructions: string,
  mcps: MCPDetails[],
  model: string,
  harnessType: ChatState["harnessType"],
  targetProjectId?: string,
) =>
  `${createUpdateRoomOptionsPixel(
    roomId,
    instructions,
    mcps,
    model,
    harnessType,
    targetProjectId,
  )};${createSetRoomForInsightPixel(roomId)}`;

export const updateRoomOptions = createAsyncThunk<
  { response: boolean },
  {
    roomId: string;
    instructions: string;
    mcps: MCPDetails[];
    model: string;
    runPixel: RunPixelFn;
  },
  { rejectValue: string; state: { chat: ChatState; mcp: MCPState } }
>(
  "chat/updateRoomOptions",
  async (
    { roomId, instructions, mcps, model, runPixel },
    { rejectWithValue, getState },
  ) => {
    try {
      const {
        chat: { harnessType, projectId },
      } = getState();
      const pixelString = createUpdateRoomOptionsPixel(
        roomId,
        instructions,
        mcps,
        model,
        harnessType,
        projectId || undefined,
      );
      const response = await runPixel<boolean>(
        `${pixelString};${createSetRoomForInsightPixel(roomId)}`,
      );
      return {
        response,
      };
    } catch (error) {
      console.error("Failed to call UpdateRoomOptions:", error);
      return rejectWithValue("Failed to call UpdateRoomOptions.");
    }
  },
);

const ensureRoomInsightBound = async (
  roomId: string,
  instructions: string,
  mcps: MCPDetails[],
  model: string,
  harnessType: ChatState["harnessType"],
  runPixel: RunPixelFn,
  targetProjectId?: string,
) => {
  await runPixel(
    createEnsureRoomInsightBoundPixel(
      roomId,
      instructions,
      mcps,
      model,
      harnessType,
      targetProjectId,
    ),
  );
};

const TERMINAL_STATUSES = new Set(["ProgressComplete", "Complete", "Error"]);
const POLLING_INTERVAL_MS = 300;

const uploadInsightAttachments = async (
  promptId: string,
  attachments: PendingAttachment[],
  insightId: string,
): Promise<UploadedRoomAttachment[]> => {
  if (attachments.length === 0) {
    return [];
  }

  if (!insightId) {
    throw new Error("An active insight is required to upload images.");
  }

  const preparedUploads = await Promise.all(
    attachments.map(async (attachment) => {
      const extension = getUploadFileExtension(
        attachment.fileName,
        attachment.mimeType,
      );
      // Reuse the PendingAttachment.id (already a uuid). Sharing this id with
      // the optimistic transcript event lets the post-upload dispatch merge
      // into the same row and just add the server `path`.
      const attachmentId = attachment.id;
      const uploadFileName = `${attachmentId}.${extension}`;
      const blob = await dataUrlToBlob(attachment.dataUrl);

      return {
        attachmentId,
        promptId,
        fileName: sanitizeFileName(attachment.fileName),
        mimeType: attachment.mimeType,
        timestamp: new Date().toISOString(),
        uploadFileName,
        file: new File([blob], uploadFileName, { type: attachment.mimeType }),
      };
    }),
  );

  const uploadPath = `agent-chat/${promptId}`;
  const payload = await uploadInsightAsset(
    preparedUploads.map((attachment) => attachment.file),
    insightId,
    null,
    uploadPath,
  );

  if (!Array.isArray(payload)) {
    throw new Error("Unexpected upload response from Monolith.");
  }

  const uploadedPathByName = new Map<string, string>();
  payload.forEach((item) => {
    if (item.fileName && item.fileLocation) {
      uploadedPathByName.set(
        item.fileName,
        sanitizeInsightFilePath(item.fileLocation),
      );
    }
  });

  return preparedUploads.map((attachment) => {
    const uploadedPath = uploadedPathByName.get(attachment.uploadFileName);
    if (!uploadedPath) {
      throw new Error(
        `Image upload response did not include ${attachment.uploadFileName}.`,
      );
    }
    return {
      attachmentId: attachment.attachmentId,
      promptId: attachment.promptId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      path: uploadedPath,
      timestamp: attachment.timestamp,
    };
  });
};

export const runAgentHarness = createAsyncThunk<
  { response: string },
  {
    message: string;
    promptId: string;
    attachments?: PendingAttachment[];
    insightId: string;
    shouldGenerateRoomName?: boolean;
    runPixel: RunPixelFn;
    runPixelAsync: RunPixelAsyncFn;
    getPixelAsyncResult: GetPixelAsyncResultFn;
    getPixelJobStreaming: GetPixelJobStreamingFn;
    projectId?: string;
    engineId?: string;
  },
  { rejectValue: string; state: { chat: ChatState; mcp: MCPState } }
>(
  "chat/runAgentHarness",
  async (
    {
      message,
      promptId,
      attachments = [],
      insightId,
      shouldGenerateRoomName,
      runPixel,
      runPixelAsync,
      getPixelAsyncResult,
      getPixelJobStreaming,
      projectId,
    },
    { rejectWithValue, getState, dispatch },
  ) => {
    try {
      const { chat, mcp } = getState();
      const targetProjectId = projectId ?? chat.projectId;

      const selectedMcps: MCPDetails[] = mcp.selectedMcps.map((x) => ({
        id: x.id,
        name: x.name,
        type: x.type,
      }));

      // Bind the room+insight and upload any image attachments concurrently;
      // they have no data dependency on each other.
      const safeMessage = sanitizePixelArg(message);
      const [, uploadedAttachments] = await Promise.all([
        ensureRoomInsightBound(
          chat.roomId,
          selectEffectiveSystemPrompt({ chat }),
          selectedMcps,
          chat.engineId,
          chat.harnessType,
          runPixel,
          targetProjectId || undefined,
        ),
        attachments.length === 0
          ? Promise.resolve([] as UploadedRoomAttachment[])
          : uploadInsightAttachments(promptId, attachments, insightId),
      ]);

      uploadedAttachments.forEach((uploadedAttachment, index) => {
        const matchingDraft = attachments[index];
        dispatch(
          addTranscriptEvent({
            kind: "attachment",
            attachmentId: uploadedAttachment.attachmentId,
            promptId: uploadedAttachment.promptId,
            fileName: uploadedAttachment.fileName,
            mimeType: uploadedAttachment.mimeType,
            path: uploadedAttachment.path,
            dataUrl: matchingDraft?.dataUrl,
            timestamp: uploadedAttachment.timestamp,
            harnessType: chat.harnessType,
          }),
        );
      });

      const paramMap = {
        project: targetProjectId,
        permissionMode: chat.permissionMode,
        promptId,
        mediaInputs: uploadedAttachments.map((attachment) => ({
          attachmentId: attachment.attachmentId,
          promptId: attachment.promptId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          path: attachment.path,
        })),
      };

      const pixelString = `RunAgent(roomId='${chat.roomId}', engine='${chat.engineId}', command='<encode>${safeMessage}</encode>', harnessType="${chat.harnessType}", maxReflections=20, paramValues=[${JSON.stringify(paramMap)}]) ;`;

      const { jobId } = await runPixelAsync(pixelString);

      if (!jobId) {
        throw new Error("No job ID returned from pixel execution");
      }

      let isPolling = true;

      while (isPolling) {
        try {
          const response = await getPixelJobStreaming(jobId);

          if (response && response.message.length > 0) {
            for (const streamMsg of response.message) {
              const events = parseTranscriptMessage(
                streamMsg,
                chat.harnessType,
              );
              for (const event of events) {
                dispatch(addTranscriptEvent(event));
              }
            }
          }

          if (TERMINAL_STATUSES.has(response.status)) {
            isPolling = false;

            if (response.status === "Error") {
              throw new Error("Streaming job encountered an error");
            }
          }

          if (isPolling) {
            await new Promise((resolve) =>
              setTimeout(resolve, POLLING_INTERVAL_MS),
            );
          }
        } catch (error) {
          isPolling = false;
          throw error;
        }
      }

      const result = await getPixelAsyncResult<[unknown, string]>(jobId);

      if (result.errors.length > 0) {
        throw new Error(result.errors.join(""));
      }

      const finalResponse =
        result.results.length > 1
          ? (result.results[1].output as string)
          : (result.results[0].output as string);

      if (shouldGenerateRoomName) {
        try {
          const generatedRoomName = await runPixel<string>(
            `GenerateRoomName(roomId='${chat.roomId}', prompt='<encode>${safeMessage}</encode>', engine='${chat.engineId}');`,
          );
          if (generatedRoomName?.trim()) {
            dispatch(
              updateConversationRoomName({
                roomId: chat.roomId,
                roomName: generatedRoomName.trim(),
              }),
            );
          }
        } catch (error) {
          console.warn("GenerateRoomName failed:", error);
        }
      }

      // OLD DETERMINISTIC APP BUILDING AFTER LAST MESSAGE... DON'T DELETE FOR NOW..
      // const buildAndPublishPixel = `BuildAndPublishApp(project='${targetProjectId}')`;
      // try {
      //     await runPixel(buildAndPublishPixel);
      // } catch (error) {
      //     console.warn("BuildAndPublishApp failed:", error);
      // } finally {
      //     setTimeout(() => {
      //         dispatch({ type: "chat/bumpIframeRefresh" });
      //     }, 500);
      // }

      dispatch({ type: "chat/bumpIframeRefresh" });

      return { response: finalResponse ?? "" };
    } catch (error) {
      console.error("runAgentHarness streaming error:", error);
      return rejectWithValue("Failed to run the selected agent.");
    }
  },
);
