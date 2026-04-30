import { createAsyncThunk } from "@reduxjs/toolkit";
import { parseTranscriptMessage } from "@/lib/parseTranscriptMessage";
import type { StreamingResponse } from "@/contexts/AppContext";
import {
  selectEffectiveSystemPrompt,
  type ChatState,
  updateConversationRoomName,
} from "../slices/chatSlice";
import type { MCPState } from "../slices/mcpSlice";
import type { EnginesState } from "../slices/enginesSlice";
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

const sanitizePixelArg = (value: string) => value.replace(/'/g, '"');

interface MCPDetails {
  id: string;
  name: string;
  type: string;
}

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

export const updateRoomOptions = createAsyncThunk<
  { response: boolean },
  {
    roomId: string;
    instructions: string;
    mcps: MCPDetails[];
    model: string;
    runPixel: RunPixelFn;
  },
  { rejectValue: string; state: { chat: ChatState; mcp: MCPState; engines: EnginesState } }
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
      const response = await runPixel<boolean>(pixelString);
      return {
        response,
      };
    } catch (error) {
      console.error("Failed to call UpdateRoomOptions:", error);
      return rejectWithValue("Failed to call UpdateRoomOptions.");
    }
  },
);

const TERMINAL_STATUSES = new Set(["ProgressComplete", "Complete", "Error"]);
const POLLING_INTERVAL_MS = 300;

export const runAgentHarness = createAsyncThunk<
  { response: string },
  {
    message: string;
    shouldGenerateRoomName?: boolean;
    runPixel: RunPixelFn;
    runPixelAsync: RunPixelAsyncFn;
    getPixelAsyncResult: GetPixelAsyncResultFn;
    getPixelJobStreaming: GetPixelJobStreamingFn;
    projectId?: string;
    engineId?: string;
  },
  { rejectValue: string; state: { chat: ChatState; mcp: MCPState; engines: EnginesState } }
>(
  "chat/runAgentHarness",
  async (
    {
      message,
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
      const { chat, mcp, engines } = getState();
      const targetProjectId = projectId ?? chat.projectId;

      const selectedMcps: MCPDetails[] = mcp.selectedMcps.map((x) => ({
        id: x.id,
        name: x.name,
        type: x.type,
      }));

      const updateRoomOptionsPixel = createUpdateRoomOptionsPixel(
        chat.roomId,
        selectEffectiveSystemPrompt({ chat, engines }),
        selectedMcps,
        chat.engineId,
        chat.harnessType,
        targetProjectId || undefined,
      );
      await runPixel(updateRoomOptionsPixel);

      const safeMessage = sanitizePixelArg(message);

      const paramMap = {
        project: targetProjectId,
        permissionMode: chat.permissionMode,
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
