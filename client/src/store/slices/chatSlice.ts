import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { TranscriptHarness } from "@/types/transcript";
import { createProject, createReactProject } from "./createProjectSlice";
import { runAgentHarness } from "../thunks/runAgentHarness";

export type ConversationRoom = {
  roomId: string;
  roomName: string;
  dateCreated: string;
  pinned: boolean;
};

/**
 * Structured detail for a failed {@code RunAgent} run, surfaced in the error
 * bubble for debugging. Sourced from the durable run record the reactor returns
 * ({@code status}, {@code errorMessage}, plus run/room identifiers).
 */
export type AgentRunFailureDetail = {
  status?: string;
  errorMessage?: string;
  harnessType?: string;
  runId?: string;
  roomId?: string;
  jobId?: string;
};

/** Payload the {@code runAgentHarness} thunk rejects with. */
export type RunErrorPayload = {
  message: string;
  detail?: AgentRunFailureDetail;
};

export type ChatMessage = {
  id: string;
  author: string;
  role: "system" | "assistant" | "user";
  time: string;
  /** Epoch ms used to interleave messages with transcript events. */
  createdAt: number;
  content: string;
  status?: "loading" | "streaming" | "complete" | "error";
  /** Present on a system error message: structured failure detail for the UI. */
  errorDetail?: AgentRunFailureDetail;
};

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions";

export type HarnessType = TranscriptHarness;

export interface ChatState {
  roomId: string;
  engineId: string;
  engineDisplayName: string;
  projectId: string;
  /**
   * Workspace ("agent identity") id this chat is bound to.
   *
   * <p>When set, it's passed as {@code workspaceId} on the {@code RunAgent}
   * pixel call, which makes the backend AgentRunner overlay it onto
   * room.options.workspace.workspace_id for that run. That binding drives the
   * server-side per-workspace config in {@code WORKSPACE.CONFIG_JSON}: subdir
   * (e.g. "client"), hooks (e.g. git_commit), MCP layer, system prompt
   * fallback, etc.
   *
   * <p>Empty string = no workspace binding; agent runs with whatever defaults
   * the room itself carries (legacy / pre-CONFIG_JSON behavior).
   */
  workspaceId: string;
  permissionMode: PermissionMode;
  harnessType: HarnessType;
  /**
   * Maximum number of agent turns for a single {@code RunAgent} call. Passed
   * through as the {@code maxTurns} arg on the pixel. Defaults to
   * {@link DEFAULT_MAX_TURNS}.
   */
  maxTurns: number;
  inputMessage: string;
  messages: ChatMessage[];
  pendingMessageId: string | null;
  iframeRefreshKey: number;
  conversationList: ConversationRoom[];
  isLoadingConversations: boolean;
}

const createRoomId = () => {
  return uuidv4();
};

const LAST_PROJECT_ID_KEY = "agent47:lastProjectId";
const LAST_HARNESS_TYPE_KEY = "agent47:lastHarnessType";
const LAST_ENGINE_ID_KEY = "agent47:lastEngineId";
const LAST_ENGINE_DISPLAY_NAME_KEY = "agent47:lastEngineDisplayName";
const LAST_WORKSPACE_ID_KEY = "agent47:lastWorkspaceId";
const LAST_MAX_TURNS_KEY = "agent47:lastMaxTurns";

/**
 * Default per-run agent turn cap; used when none is stored or the value is
 * invalid. Mirrors the backend default {@code AgentConfig.Budgets.DEFAULT_MAX_TURNS}
 * (= 30); keep in sync if the backend default changes.
 */
export const DEFAULT_MAX_TURNS = 30;

const VALID_HARNESS_TYPES: HarnessType[] = [
  "claude_code",
  "github_copilot_py",
  "semoss",
];

const readLocalStorage = (key: string): string | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const writeLocalStorage = (key: string, value: string) => {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore
  }
};

export const lastRoomIdKey = (projectId: string) =>
  `agent47:lastRoomId:${projectId}`;

export const readLastRoomId = (projectId: string): string | null =>
  readLocalStorage(lastRoomIdKey(projectId));

export const writeLastRoomId = (projectId: string, roomId: string) =>
  writeLocalStorage(lastRoomIdKey(projectId), roomId);

const loadInitialHarnessType = (): HarnessType => {
  const stored = readLocalStorage(LAST_HARNESS_TYPE_KEY);
  // Flip the legacy in-Java github_copilot harness over to the Python sidecar.
  // The UI no longer exposes the Java option.
  if (stored === "github_copilot") {
    writeLocalStorage(LAST_HARNESS_TYPE_KEY, "github_copilot_py");
    return "github_copilot_py";
  }
  return stored && (VALID_HARNESS_TYPES as string[]).includes(stored)
    ? (stored as HarnessType)
    : "claude_code";
};

const loadInitialProjectId = (): string => readLocalStorage(LAST_PROJECT_ID_KEY) ?? "";

const DEFAULT_ENGINE_ID = "aa876e7e-e78e-404d-b7db-1a44236bc2a5";

const loadInitialEngineId = (): string =>
  readLocalStorage(LAST_ENGINE_ID_KEY) ?? DEFAULT_ENGINE_ID;

const loadInitialEngineDisplayName = (): string =>
  readLocalStorage(LAST_ENGINE_DISPLAY_NAME_KEY) ?? "";

const loadInitialWorkspaceId = (): string =>
  readLocalStorage(LAST_WORKSPACE_ID_KEY) ?? "";

// Coerce arbitrary input to a positive integer turn cap, falling back to the
// default when the value isn't a usable number.
export const sanitizeMaxTurns = (value: unknown): number => {
  const n =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_TURNS;
  return Math.floor(n);
};

const loadInitialMaxTurns = (): number =>
  sanitizeMaxTurns(readLocalStorage(LAST_MAX_TURNS_KEY));

const loadInitialRoomId = (): string => {
  const projectId = loadInitialProjectId();
  if (projectId) {
    const saved = readLastRoomId(projectId);
    if (saved) return saved;
  }
  return createRoomId();
};

const initialState: ChatState = {
  roomId: loadInitialRoomId(),
  engineId: loadInitialEngineId(),
  engineDisplayName: loadInitialEngineDisplayName(),
  projectId: loadInitialProjectId(),
  workspaceId: loadInitialWorkspaceId(),
  permissionMode: "acceptEdits",
  harnessType: loadInitialHarnessType(),
  maxTurns: loadInitialMaxTurns(),
  inputMessage: "",
  messages: [],
  pendingMessageId: null,
  iframeRefreshKey: 0,
  conversationList: [],
  isLoadingConversations: false,
};

const createMessageId = () =>
  `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatMessageTime = (value: Date) =>
  value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const getAuthorLabel = (
  role: ChatMessage["role"],
  harnessType: HarnessType = "claude_code",
) => {
  switch (role) {
    case "assistant":
      if (harnessType === "github_copilot_py") return "GitHub Copilot";
      if (harnessType === "semoss") return "SEMOSS";
      return "Agent";
    case "system":
      return "System";
    default:
      return "You";
  }
};

const makeSystemErrorMessage = (
  content: string,
  detail?: AgentRunFailureDetail,
): ChatMessage => {
  const now = new Date();
  return {
    id: createMessageId(),
    author: getAuthorLabel("system"),
    role: "system",
    time: formatMessageTime(now),
    createdAt: now.getTime(),
    content,
    status: "error",
    errorDetail: detail,
  };
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setRoomId(state, action: PayloadAction<string>) {
      state.roomId = action.payload;
      if (state.projectId && action.payload) {
        writeLastRoomId(state.projectId, action.payload);
      }
    },
    startNewRoom(state) {
      const nextRoomId = createRoomId();
      state.roomId = nextRoomId;
      state.messages = [];
      state.pendingMessageId = null;
      state.inputMessage = "";
      if (state.projectId) {
        writeLastRoomId(state.projectId, nextRoomId);
      }
    },
    setEngineId(state, action: PayloadAction<string>) {
      state.engineId = action.payload;
      writeLocalStorage(LAST_ENGINE_ID_KEY, action.payload);
    },
    setEngineDisplayName(state, action: PayloadAction<string>) {
      state.engineDisplayName = action.payload;
      writeLocalStorage(LAST_ENGINE_DISPLAY_NAME_KEY, action.payload);
    },
    setProjectId(state, action: PayloadAction<string>) {
      state.projectId = action.payload;
      writeLocalStorage(LAST_PROJECT_ID_KEY, action.payload);
    },
    setWorkspaceId(state, action: PayloadAction<string>) {
      state.workspaceId = action.payload;
      writeLocalStorage(LAST_WORKSPACE_ID_KEY, action.payload);
    },
    setPermissionMode(state, action: PayloadAction<PermissionMode>) {
      state.permissionMode = action.payload;
    },
    setHarnessType(state, action: PayloadAction<HarnessType>) {
      state.harnessType = action.payload;
      writeLocalStorage(LAST_HARNESS_TYPE_KEY, action.payload);
    },
    setMaxTurns(state, action: PayloadAction<number>) {
      const next = sanitizeMaxTurns(action.payload);
      state.maxTurns = next;
      writeLocalStorage(LAST_MAX_TURNS_KEY, String(next));
    },
    setActiveProject(state, action: PayloadAction<string>) {
      if (state.projectId && state.roomId) {
        writeLastRoomId(state.projectId, state.roomId);
      }

      const nextProjectId = action.payload;
      const restoredRoomId = readLastRoomId(nextProjectId);

      state.projectId = nextProjectId;
      state.roomId = restoredRoomId ?? createRoomId();
      state.iframeRefreshKey += 1;
      state.messages = [];
      state.pendingMessageId = null;
      state.inputMessage = "";
      state.conversationList = [];
      state.isLoadingConversations = false;
      writeLocalStorage(LAST_PROJECT_ID_KEY, nextProjectId);
    },
    setInputMessage(state, action: PayloadAction<string>) {
      state.inputMessage = action.payload;
    },
    bumpIframeRefresh(state) {
      state.iframeRefreshKey += 1;
    },
    setConversationList(state, action: PayloadAction<ConversationRoom[]>) {
      state.conversationList = action.payload;
    },
    updateConversationRoomName(
      state,
      action: PayloadAction<{ roomId: string; roomName: string }>,
    ) {
      state.conversationList = state.conversationList.map((room) =>
        room.roomId === action.payload.roomId
          ? { ...room, roomName: action.payload.roomName }
          : room,
      );
    },
    setIsLoadingConversations(state, action: PayloadAction<boolean>) {
      state.isLoadingConversations = action.payload;
    },
    setMessages(state, action: PayloadAction<ChatMessage[]>) {
      state.messages = action.payload;
      state.pendingMessageId = null;
    },
    addMessage: {
      reducer(
        state,
        action: PayloadAction<{
          id: string;
          author: string;
          role: ChatMessage["role"];
          time: string;
          createdAt: number;
          content: string;
        }>,
      ) {
        state.messages.push(action.payload);
      },
      prepare({
        role,
        content,
      }: {
        role: ChatMessage["role"];
        content: string;
      }) {
        const now = new Date();
        return {
          payload: {
            id: createMessageId(),
            author: getAuthorLabel(role),
            role,
            time: formatMessageTime(now),
            createdAt: now.getTime(),
            content,
          },
        };
      },
    },
  },
  extraReducers: (builder) => {
    builder.addCase(runAgentHarness.pending, (state) => {
      // No placeholder message — the socket transcript stream owns the
      // assistant UI. We just flag in-flight state via pendingMessageId
      // so the composer knows to disable sending.
      state.pendingMessageId = createMessageId();
    });
    builder.addCase(runAgentHarness.fulfilled, (state) => {
      state.pendingMessageId = null;
      if (state.projectId && state.roomId) {
        writeLastRoomId(state.projectId, state.roomId);
      }
    });
    builder.addCase(runAgentHarness.rejected, (state, action) => {
      if (state.pendingMessageId) {
        // The thunk rejects with { message, detail } via rejectWithValue; fall
        // back to the generic copy only when no message was provided. RTK infers
        // action.payload as RunErrorPayload | undefined from the thunk's typed
        // rejectValue, so no cast is needed here.
        const payload = action.payload;
        const content =
          payload?.message || "Something went wrong. Please try again.";
        state.messages.push(makeSystemErrorMessage(content, payload?.detail));
        state.pendingMessageId = null;
      }
    });
    builder.addCase(createProject.fulfilled, (state, action) => {
      state.projectId = action.payload.projectId;
      state.roomId = createRoomId();
      state.iframeRefreshKey += 1;
      state.messages = [];
      state.pendingMessageId = null;
      state.inputMessage = "";
      state.conversationList = [];
      state.isLoadingConversations = false;
      writeLocalStorage(LAST_PROJECT_ID_KEY, action.payload.projectId);
      writeLastRoomId(action.payload.projectId, state.roomId);
    });
    builder.addCase(createReactProject.fulfilled, (state, action) => {
      state.projectId = action.payload.projectId;
      state.roomId = createRoomId();
      state.iframeRefreshKey += 1;
      state.messages = [];
      state.pendingMessageId = null;
      state.inputMessage = "";
      state.conversationList = [];
      state.isLoadingConversations = false;
      writeLocalStorage(LAST_PROJECT_ID_KEY, action.payload.projectId);
      writeLastRoomId(action.payload.projectId, state.roomId);
    });
  },
});

export const {
  setRoomId,
  startNewRoom,
  setEngineId,
  setEngineDisplayName,
  setProjectId,
  setWorkspaceId,
  setPermissionMode,
  setHarnessType,
  setMaxTurns,
  setActiveProject,
  setInputMessage,
  bumpIframeRefresh,
  setConversationList,
  updateConversationRoomName,
  setIsLoadingConversations,
  setMessages,
  addMessage,
} = chatSlice.actions;
export { createRoomId };

export default chatSlice.reducer;
