import { createAsyncThunk } from "@reduxjs/toolkit";
import { parseTranscriptMessage } from "@/lib/parseTranscriptMessage";
import type { StreamingResponse } from "@/contexts/AppContext";
import {
  type ChatState,
  updateConversationRoomName,
} from "../slices/chatSlice";
import type { MCPState } from "../slices/mcpSlice";
import type { EnginesState } from "../slices/enginesSlice";
import {
  addTranscriptEvent,
  type TranscriptState,
} from "../slices/transcriptSlice";
import { fetchCommitHistory } from "../slices/gitSlice";
import type { AssistantText } from "@/types/transcript";
import {
  normalizeSemossTimestampToIso,
  parsePlaygroundMessages,
  type PlaygroundMessage,
} from "./conversationHistory";

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

type StreamMessage = StreamingResponse["message"][number];

type SemossStreamRenderableType = "content" | "thinking" | "tool";

type SemossStreamState = {
  userPromptId: string;
  toolIndexToId: Record<number, string>;
  toolArgumentBuffers: Record<string, string>;
  toolIndexToName: Record<number, string>;
  assistantBlockCounter: number;
  thinkingBlockCounter: number;
  currentAssistantBlockId?: string;
  currentThinkingBlockId?: string;
  lastRenderableType?: SemossStreamRenderableType;
};

const LARGE_LIVE_TOOL_VALUE_KEYS = new Set([
  "content",
  "new_string",
  "old_string",
  "script",
  "text",
]);
const MAX_LIVE_TOOL_STRING_LENGTH = 240;

const sanitizePixelArg = (value: string) => value.replace(/'/g, '"');

interface MCPDetails {
  id: string;
  name: string;
  type: string;
}

const createUpdateRoomOptionsPixel = (
  roomId: string,
  mcps: MCPDetails[],
  model: string,
  harnessType: ChatState["harnessType"],
  targetProjectId?: string,
) => {
  const mcpStrings = mcps.map(
    (mcp) => `{'id':'${mcp.id}','name':'${mcp.name}','type':'${mcp.type}'}`,
  );
  const targetProjectPart = targetProjectId
    ? `, "targetProjectId":'${sanitizePixelArg(targetProjectId)}'`
    : "";
  return `UpdateRoomOptions(roomId='${roomId}', roomOptions=[{"modelId":'${model}', "harnessType":'${harnessType}', "mcp":[${mcpStrings.join(",")}]${targetProjectPart} }] )`;
};

export const updateRoomOptions = createAsyncThunk<
  { response: boolean },
  {
    roomId: string;
    mcps: MCPDetails[];
    model: string;
    runPixel: RunPixelFn;
  },
  {
    rejectValue: string;
    state: { chat: ChatState; mcp: MCPState; engines: EnginesState };
  }
>(
  "chat/updateRoomOptions",
  async (
    { roomId, mcps, model, runPixel },
    { rejectWithValue, getState },
  ) => {
    try {
      const {
        chat: { harnessType, projectId },
      } = getState();
      const pixelString = createUpdateRoomOptionsPixel(
        roomId,
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
const SEMOSS_HISTORY_SYNC_CLOCK_SKEW_MS = 60_000;

const parseSemossTimestamp = (timestamp: string) => {
  const parsed = Date.parse(normalizeSemossTimestampToIso(timestamp));
  return Number.isFinite(parsed) ? parsed : null;
};

const createSemossFallbackTranscriptEvents = (
  roomId: string,
  message: string,
  response: string,
) => {
  const timestamp = new Date().toISOString();
  const idBase = `semoss-${roomId}-${Date.now()}`;

  return [
    {
      kind: "user-prompt" as const,
      promptId: `${idBase}-user`,
      text: message,
      timestamp,
      harnessType: "semoss" as const,
    },
    {
      kind: "assistant-text" as const,
      eventId: `${idBase}-assistant`,
      text: response,
      timestamp,
      harnessType: "semoss" as const,
    },
  ];
};

const normalizeTranscriptText = (value: string) =>
  value.replace(/\r\n/g, "\n").trim();

const findLastSemossAssistantText = (
  events: TranscriptState["events"],
  startIndex: number,
): AssistantText | undefined => {
  for (let index = events.length - 1; index >= startIndex; index -= 1) {
    const event = events[index];
    if (event?.kind === "assistant-text" && event.harnessType === "semoss") {
      return event;
    }
  }
  return undefined;
};

const ensureSemossFinalAssistantText = ({
  jobId,
  response,
  transcriptEvents,
  transcriptStartIndex,
}: {
  jobId: string;
  response: string;
  transcriptEvents: TranscriptState["events"];
  transcriptStartIndex: number;
}): AssistantText | null => {
  const normalizedResponse = normalizeTranscriptText(response);
  if (!normalizedResponse) {
    return null;
  }

  const lastAssistantEvent = findLastSemossAssistantText(
    transcriptEvents,
    transcriptStartIndex,
  );

  if (
    lastAssistantEvent &&
    normalizeTranscriptText(lastAssistantEvent.text) === normalizedResponse &&
    lastAssistantEvent.isPartial === false
  ) {
    return null;
  }

  if (
    lastAssistantEvent &&
    normalizeTranscriptText(lastAssistantEvent.text) === normalizedResponse
  ) {
    return {
      ...lastAssistantEvent,
      text: response,
      isPartial: false,
      timestamp: lastAssistantEvent.timestamp || new Date().toISOString(),
    };
  }

  if (
    lastAssistantEvent &&
    normalizedResponse.startsWith(normalizeTranscriptText(lastAssistantEvent.text))
  ) {
    return {
      ...lastAssistantEvent,
      text: response,
      isPartial: false,
      timestamp: lastAssistantEvent.timestamp || new Date().toISOString(),
    };
  }

  return {
    kind: "assistant-text",
    eventId: `semoss-final-${jobId}`,
    text: response,
    isPartial: false,
    timestamp: new Date().toISOString(),
    harnessType: "semoss",
    model: lastAssistantEvent?.model,
  };
};

const summarizeLargeLiveValue = (value: string) => {
  const lineCount = value.split(/\r\n|\r|\n/).length;
  return `<${value.length.toLocaleString()} chars${lineCount > 1 ? `, ${lineCount.toLocaleString()} lines` : ""}>`;
};

const truncateLiveValue = (value: string) => {
  if (value.length <= MAX_LIVE_TOOL_STRING_LENGTH) {
    return value;
  }

  const headLength = Math.ceil(MAX_LIVE_TOOL_STRING_LENGTH * 0.65);
  const tailLength = Math.floor(MAX_LIVE_TOOL_STRING_LENGTH * 0.25);
  return `${value.slice(0, headLength)}...${value.slice(-tailLength)}`;
};

const compactLiveToolValue = (
  key: string,
  value: unknown,
  depth = 0,
): unknown => {
  if (typeof value === "string") {
    if (LARGE_LIVE_TOOL_VALUE_KEYS.has(key) || value.length > 1200) {
      return summarizeLargeLiveValue(value);
    }

    return truncateLiveValue(value);
  }

  if (Array.isArray(value)) {
    if (depth > 1) {
      return `<${value.length.toLocaleString()} items>`;
    }

    return value
      .slice(0, 8)
      .map((item, index) =>
        compactLiveToolValue(String(index), item, depth + 1),
      );
  }

  if (value && typeof value === "object") {
    if (depth > 1) {
      return "<object>";
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        compactLiveToolValue(entryKey, entryValue, depth + 1),
      ]),
    );
  }

  return value;
};

const compactLiveToolRecord = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return compactLiveToolValue("", value) as Record<string, unknown>;
};

const parseLiveToolArguments = (
  value: string,
): Record<string, unknown> | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return compactLiveToolRecord(parsed);
    }
  } catch {
    // Raw SEMOSS tool argument chunks are JSON fragments. Keep a compact
    // preview visible until enough chunks arrive to parse the object.
  }

  return {
    arguments: truncateLiveValue(trimmed.replace(/\s+/g, " ")),
  };
};

const compactSemossLiveEvent = (
  data: Record<string, unknown>,
): Record<string, unknown> => {
  if (data.kind !== "tool-invocation" && data.kind !== "tool-result") {
    return data;
  }

  const compacted = {
    ...data,
    arguments: compactLiveToolRecord(data.arguments),
    toolParameterValues: compactLiveToolRecord(data.toolParameterValues),
  };
  const toolCall =
    data.toolCall && typeof data.toolCall === "object" && !Array.isArray(data.toolCall)
      ? (data.toolCall as Record<string, unknown>)
      : undefined;

  if (!toolCall) {
    return compacted;
  }

  return {
    ...compacted,
    toolCall: {
      ...toolCall,
      arguments: compactLiveToolRecord(toolCall.arguments),
    },
  };
};

const getSemossTextBlockId = (
  state: SemossStreamState,
  jobId: string,
  streamType: "content" | "thinking",
) => {
  if (streamType === "thinking") {
    if (state.lastRenderableType !== "thinking" || !state.currentThinkingBlockId) {
      state.currentThinkingBlockId = `semoss-thinking-${jobId}-${state.thinkingBlockCounter}`;
      state.thinkingBlockCounter += 1;
    }
    state.lastRenderableType = "thinking";
    return state.currentThinkingBlockId;
  }

  if (state.lastRenderableType !== "content" || !state.currentAssistantBlockId) {
    state.currentAssistantBlockId = `semoss-assistant-${jobId}-${state.assistantBlockCounter}`;
    state.assistantBlockCounter += 1;
  }
  state.lastRenderableType = "content";
  return state.currentAssistantBlockId;
};

const normalizeSemossStreamingChunk = ({
  streamMessage,
  jobId,
  streamState,
}: {
  streamMessage: StreamMessage;
  jobId: string;
  streamState: SemossStreamState;
}): unknown => {
  const data = streamMessage.data ?? {};

  if (streamMessage.stream_type === "content" || streamMessage.stream_type === "thinking") {
    if (typeof data.kind === "string") {
      if (data.kind === "user-prompt") {
        return {
          ...data,
          promptId: streamState.userPromptId,
        };
      }

      if (data.kind === "assistant-text") {
        const eventId = getSemossTextBlockId(
          streamState,
          jobId,
          streamMessage.stream_type,
        );

        return {
          ...data,
          eventId,
        };
      }

      return data;
    }

    const textValue =
      typeof data.text === "string"
        ? data.text
        : typeof data.content === "string"
          ? data.content
          : typeof data.thinking === "string"
            ? data.thinking
            : "";

    if (!textValue) {
      return streamMessage;
    }

    const eventId = getSemossTextBlockId(
      streamState,
      jobId,
      streamMessage.stream_type,
    );

    return {
      ...data,
      kind: "assistant-text",
      eventId,
      text: textValue,
      display: streamMessage.stream_type === "thinking" ? "intent" : undefined,
      isPartial:
        typeof data.finish_reason === "string"
          ? data.finish_reason !== "completed"
          : true,
      timestamp:
        typeof data.timestamp === "string"
          ? data.timestamp
          : new Date().toISOString(),
    };
  }

  if (streamMessage.stream_type !== "tool") {
    return streamMessage;
  }

  if (typeof data.kind === "string") {
    streamState.lastRenderableType = "tool";
    return compactSemossLiveEvent(data);
  }

  if (typeof data.finish_reason === "string") {
    streamState.lastRenderableType = "tool";
    return null;
  }

  const toolIndex =
    typeof data.index === "number" ? data.index : undefined;

  if (typeof toolIndex !== "number") {
    return null;
  }

  streamState.lastRenderableType = "tool";

  const existingToolUseId = streamState.toolIndexToId[toolIndex];
  const incomingToolUseId =
    typeof data.id === "string" && data.id ? data.id : existingToolUseId;

  if (!incomingToolUseId) {
    return null;
  }

  streamState.toolIndexToId[toolIndex] = incomingToolUseId;

  const functionPayload =
    data.function && typeof data.function === "object" && !Array.isArray(data.function)
      ? (data.function as Record<string, unknown>)
      : undefined;
  const nextToolName =
    typeof functionPayload?.name === "string"
      ? functionPayload.name
      : "";
  if (nextToolName) {
    streamState.toolIndexToName[toolIndex] = nextToolName;
  }

  if (typeof functionPayload?.arguments === "string") {
    streamState.toolArgumentBuffers[incomingToolUseId] =
      (streamState.toolArgumentBuffers[incomingToolUseId] ?? "") +
      functionPayload.arguments;
  }

  const toolArguments = parseLiveToolArguments(
    streamState.toolArgumentBuffers[incomingToolUseId] ?? "",
  );

  return {
    kind: "tool-invocation",
    toolUseId: incomingToolUseId,
    eventId: `semoss-tool-invocation-${incomingToolUseId}`,
    toolName: streamState.toolIndexToName[toolIndex] ?? "",
    ...(toolArguments ? { arguments: toolArguments } : {}),
    status: "streaming",
    timestamp: new Date().toISOString(),
  };
};

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
  {
    rejectValue: string;
    state: {
      chat: ChatState;
      mcp: MCPState;
      engines: EnginesState;
      transcript: TranscriptState;
    };
  }
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
      const { chat, mcp } = getState();
      const targetProjectId = projectId ?? chat.projectId;
      const initialTranscriptEventCount = getState().transcript.events.length;
      const runStartedAtMs = Date.now();
      const semossUserPromptId = `semoss-user-${chat.roomId}-${runStartedAtMs}`;

      if (chat.harnessType === "semoss") {
        dispatch(
          addTranscriptEvent({
            kind: "user-prompt",
            promptId: semossUserPromptId,
            text: message,
            timestamp: new Date(runStartedAtMs).toISOString(),
            harnessType: "semoss",
          }),
        );
      }

      const selectedMcps: MCPDetails[] = mcp.selectedMcps.map((x) => ({
        id: x.id,
        name: x.name,
        type: x.type,
      }));

      const updateRoomOptionsPixel = createUpdateRoomOptionsPixel(
        chat.roomId,
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

      // SEMOSS harness drives its own tool loop and benefits from an explicit
      // maxTurns cap. CLI harnesses (claude_code, github_copilot_py) manage their
      // own loops and ignore the cap.
      const maxTurnsPart = chat.harnessType === "semoss" ? ", maxTurns=30" : "";

      // When a workspace id is configured, pass it as a named arg on RunAgent
      // so the backend AgentRunner overlays it onto the room for the duration
      // of this call. That binding drives the server-side per-workspace config
      // (subdir, hooks, MCPs, system prompt) from WORKSPACE.CONFIG_JSON.
      // Empty string = no binding; agent runs with whatever defaults the room
      // itself carries.
      const trimmedWorkspaceId = chat.workspaceId?.trim() ?? "";
      const workspaceIdPart = trimmedWorkspaceId
        ? `, workspaceId='${sanitizePixelArg(trimmedWorkspaceId)}'`
        : "";

      const pixelString = `RunAgent(roomId='${chat.roomId}', engine='${chat.engineId}', command='${safeMessage}', harnessType="${chat.harnessType}"${maxTurnsPart}, maxReflections=0, paramValues=[${JSON.stringify(paramMap)}]${workspaceIdPart}) ;`;

      const { jobId } = await runPixelAsync(pixelString);

      if (!jobId) {
        throw new Error("No job ID returned from pixel execution");
      }

      let isPolling = true;
      const semossStreamState: SemossStreamState = {
        userPromptId: semossUserPromptId,
        toolIndexToId: {},
        toolArgumentBuffers: {},
        toolIndexToName: {},
        assistantBlockCounter: 0,
        thinkingBlockCounter: 0,
      };

      while (isPolling) {
        try {
          const response = await getPixelJobStreaming(jobId);

          if (response && response.message.length > 0) {
            for (const streamMsg of response.message) {
              const normalizedStreamMsg =
                chat.harnessType === "semoss"
                  ? normalizeSemossStreamingChunk({
                      streamMessage: streamMsg,
                      jobId,
                      streamState: semossStreamState,
                    })
                  : streamMsg;

              if (!normalizedStreamMsg) {
                continue;
              }

              const events = parseTranscriptMessage(
                normalizedStreamMsg,
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

      if (
        chat.harnessType === "semoss" &&
        getState().transcript.events.length === initialTranscriptEventCount
      ) {
        for (const event of createSemossFallbackTranscriptEvents(
          chat.roomId,
          message,
          String(finalResponse ?? ""),
        )) {
          dispatch(addTranscriptEvent(event));
        }
      } else if (chat.harnessType === "semoss") {
        const finalAssistantEvent = ensureSemossFinalAssistantText({
          jobId,
          response: String(finalResponse ?? ""),
          transcriptEvents: getState().transcript.events,
          transcriptStartIndex: initialTranscriptEventCount,
        });

        if (finalAssistantEvent) {
          dispatch(addTranscriptEvent(finalAssistantEvent));
        }
      }

      if (chat.harnessType === "semoss") {
        try {
          const persistedMessages = await runPixel<PlaygroundMessage[]>(
            `GetPlaygroundMessages(roomId='${chat.roomId}', sort='ASC');`,
          );

          if (Array.isArray(persistedMessages)) {
            for (const event of parsePlaygroundMessages(persistedMessages)) {
              const eventTime = parseSemossTimestamp(event.timestamp);
              const isCurrentRunEvent =
                eventTime == null ||
                eventTime >= runStartedAtMs - SEMOSS_HISTORY_SYNC_CLOCK_SKEW_MS;

              // Only backfill tool events from history: the persisted store
              // carries fuller tool args/results than the compacted live
              // stream. User prompts and assistant text are already owned by
              // the live stream (+ ensureSemossFinalAssistantText), and their
              // history copies use backend message ids that don't match the
              // streamed event ids — re-adding them would double the bubble.
              const isToolEvent =
                event.kind === "tool-invocation" ||
                event.kind === "tool-result";

              if (isToolEvent && isCurrentRunEvent) {
                dispatch(addTranscriptEvent(event));
              }
            }
          }
        } catch (error) {
          console.warn("Failed to sync SEMOSS transcript from playground history:", error);
        }
      }

      if (shouldGenerateRoomName) {
        try {
          const generatedRoomName = await runPixel<string>(
            `GenerateRoomName(roomId='${chat.roomId}', prompt='${safeMessage}', engine='${chat.engineId}');`,
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

      if (targetProjectId) {
        dispatch(
          fetchCommitHistory({
            projectId: targetProjectId,
            runPixel: runPixel as <T = unknown>(p: string) => Promise<T>,
            offset: 0,
            append: false,
          }),
        );
      }

      return { response: finalResponse ?? "" };
    } catch (error) {
      console.error("runAgentHarness streaming error:", error);
      return rejectWithValue("Failed to run the selected agent.");
    }
  },
);
