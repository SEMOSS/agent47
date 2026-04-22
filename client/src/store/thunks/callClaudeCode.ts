import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  selectEffectiveSystemPrompt,
  type ChatState,
} from "../slices/chatSlice";
import type { MCPState } from "../slices/mcpSlice";
import { addTranscriptEvent } from "../slices/transcriptSlice";
import type { StreamingResponse } from "@/contexts/AppContext";
import { parseTranscriptMessage } from "@/lib/parseTranscriptMessage";

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
) => {
  const safeInstructions = sanitizePixelArg(instructions);
  const mcpStrings = mcps.map(
    (mcp) => `{'id':'${mcp.id}','name':'${mcp.name}','type':'${mcp.type}'}`,
  );
  return `UpdateRoomOptions(roomId='${roomId}', roomOptions=[{"instructions":'${safeInstructions}', "modelId":'${model}', "mcp":[${mcpStrings.join(",")}] }] )`;
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
  { rejectValue: string; state: { chat: ChatState; mcp: MCPState } }
>(
  "chat/updateRoomOptions",
  async (
    { roomId, instructions, mcps, model, runPixel },
    { rejectWithValue },
  ) => {
    try {
      const safeInstructions = sanitizePixelArg(instructions);
      const mcpStrings = mcps.map(
        (mcp) => `{'id':'${mcp.id}','name':'${mcp.name}','type':'${mcp.type}'}`,
      );
      const pixelString = `UpdateRoomOptions(roomId='${roomId}', roomOptions=[{"instructions":'${safeInstructions}', "modelId":'${model}', "mcp":[${mcpStrings.join(",")}] }] )`;
      // console.log(
      // 	"Calling UpdateRoomOptions with pixelString:",
      // 	pixelString,
      // );
      const response = await runPixel<boolean>(pixelString);
      //   console.log("UpdateRoomOptions response:", response);
      return {
        response,
      };
    } catch (error) {
      console.error("Failed to call UpdateRoomOptions:", error);
      return rejectWithValue("Failed to call UpdateRoomOptions.");
    }
  },
);

/** Terminal statuses that mean polling should stop */
const TERMINAL_STATUSES = new Set(["ProgressComplete", "Complete", "Error"]);

/** How often to poll for streaming content (ms) */
const POLLING_INTERVAL_MS = 300;

export const callClaudeCode = createAsyncThunk<
  { response: string },
  {
    message: string;
    runPixel: RunPixelFn;
    runPixelAsync: RunPixelAsyncFn;
    getPixelAsyncResult: GetPixelAsyncResultFn;
    getPixelJobStreaming: GetPixelJobStreamingFn;
    projectId?: string;
    engineId?: string;
  },
  { rejectValue: string; state: { chat: ChatState; mcp: MCPState } }
>(
  "chat/callClaudeCode",
  async (
    {
      message,
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

      // Build MCP list
      const selectedMcps: MCPDetails[] = mcp.selectedMcps.map((x) => ({
        id: x.project_id,
        name: x.project_name,
        type: "PROJECT",
      }));

      // 1. Update room options first (synchronous)
      const updateRoomOptionsPixel = createUpdateRoomOptionsPixel(
        chat.roomId,
        selectEffectiveSystemPrompt({ chat }),
        selectedMcps,
        chat.engineId,
      );
      await runPixel(updateRoomOptionsPixel);

      // 2. Build the RunAgent pixel
      const tools = [
        "Skill",
        "Bash",
        "BashOutput",
        "KillBash",
        "Read",
        "Write",
        "Edit",
        "MultiEdit",
        "NotebookEdit",
        "Glob",
        "Grep",
        "LS",
        "WebSearch",
        "WebFetch",
        "TodoRead",
        "TodoWrite",
        "Task",
        "AskUserQuestion",
      ];
      const allowedTools = tools.map((t) => `"${t}"`);
      const safeMessage = sanitizePixelArg(message);

      const paramMap = {
        project: targetProjectId,
        allowedTools: `[${allowedTools}]`,
        permissionMode: chat.permissionMode,
      };

      const pixelString = `RunAgent(roomId='${chat.roomId}', engine='${chat.engineId}', command='<encode>${safeMessage}</encode>', harnessType="${chat.harnessType}", maxReflections=20, paramValues=[${JSON.stringify(paramMap)}]) ;`;

      //   console.log(
      //     "Calling Claude Code (streaming) with pixelString:",
      //     pixelString,
      //   );

      // 3. Start async execution
      const { jobId } = await runPixelAsync(pixelString);

      if (!jobId) {
        throw new Error("No job ID returned from pixel execution");
      }

      // 4. Poll for the job to finish. Each tick returns any new transcript
      //    chunks in `response.message`; we parse them into TranscriptEvents
      //    and dispatch into the transcript slice so the UI renders them.
      let isPolling = true;

      while (isPolling) {
        try {
          const response = await getPixelJobStreaming(jobId);

          if (response && response.message.length > 0) {
            for (const streamMsg of response.message) {
              const events = parseTranscriptMessage(streamMsg);
              for (const event of events) {
                dispatch(addTranscriptEvent(event));
              }
            }
          }

          // Check for terminal status
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

      // 5. Get the final result from RunAgent so the thunk fulfills cleanly.
      //    We deliberately do NOT paint this into the chat — the transcript
      //    stream has already rendered the final assistant message.
      const result = await getPixelAsyncResult<[unknown, string]>(jobId);

      if (result.errors.length > 0) {
        throw new Error(result.errors.join(""));
      }

      const finalResponse =
        result.results.length > 1
          ? (result.results[1].output as string)
          : (result.results[0].output as string);

      // 6. Build and publish
      const buildAndPublishPixel = `BuildAndPublishApp(project='${targetProjectId}')`;
      try {
        await runPixel(buildAndPublishPixel);
      } catch (error) {
        console.warn("BuildAndPublishApp failed:", error);
      } finally {
        setTimeout(() => {
          dispatch({ type: "chat/bumpIframeRefresh" });
        }, 500);
      }

      // dispatch({ type: "chat/bumpIframeRefresh" });

      return { response: finalResponse ?? "" };
    } catch (error) {
      console.error("callClaudeCode streaming error:", error);
      return rejectWithValue("Failed to call Claude Code.");
    }
  },
);
