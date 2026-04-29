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

export type ChatMessage = {
  id: string;
  author: string;
  role: "system" | "assistant" | "user";
  time: string;
  /** Epoch ms used to interleave messages with transcript events. */
  createdAt: number;
  content: string;
  status?: "loading" | "streaming" | "complete" | "error";
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
  systemPrompt: string;
  projectId: string;
  permissionMode: PermissionMode;
  harnessType: HarnessType;
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

const VALID_HARNESS_TYPES: HarnessType[] = [
  "claude_code",
  "github_copilot_py",
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
  systemPrompt:
    "You are helping a user build and modify a React application that runs on the SEMOSS platform. Work exclusively within the current working directory — do not read, write, or traverse files in parent directories. Building the app is done exclusively through the \`BuildAndPublishApp\` tool, which takes the project id: \`${projectId}\`. Node, npm, pnpm, and other JavaScript build tooling are not available via Bash. Invoke \`BuildAndPublishApp\` once at the end of any turn that modified source files — not after every individual edit. When the user's request requires platform-specific code (calling models, querying databases, working with storage or vector catalogs), consult the relevant skill before writing code. Skill descriptions cover when to use them. If an agent-memory skill is available, follow its guidance for recalling and persisting lessons.",
  projectId: loadInitialProjectId(),
  permissionMode: "acceptEdits",
  harnessType: loadInitialHarnessType(),
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
      return harnessType === "github_copilot_py" ? "GitHub Copilot" : "Agent";
    case "system":
      return "System";
    default:
      return "You";
  }
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
    setSystemPrompt(state, action: PayloadAction<string>) {
      state.systemPrompt = action.payload;
    },
    setProjectId(state, action: PayloadAction<string>) {
      state.projectId = action.payload;
      writeLocalStorage(LAST_PROJECT_ID_KEY, action.payload);
    },
    setPermissionMode(state, action: PayloadAction<PermissionMode>) {
      state.permissionMode = action.payload;
    },
    setHarnessType(state, action: PayloadAction<HarnessType>) {
      state.harnessType = action.payload;
      writeLocalStorage(LAST_HARNESS_TYPE_KEY, action.payload);
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
    builder.addCase(runAgentHarness.rejected, (state) => {
      if (state.pendingMessageId) {
        const now = new Date();
        state.messages.push({
          id: createMessageId(),
          author: getAuthorLabel("system"),
          role: "system",
          time: formatMessageTime(now),
          createdAt: now.getTime(),
          content: "Something went wrong. Please try again.",
          status: "error",
        });
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
  setSystemPrompt,
  setProjectId,
  setPermissionMode,
  setHarnessType,
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

export const selectEffectiveSystemPrompt = (state: {
  chat: ChatState;
}): string => {
  const { systemPrompt, projectId } = state.chat;
  if (!projectId) return systemPrompt;
  return `THE PROJECT ID IS ${projectId}. ${systemPrompt}`;
};

export default chatSlice.reducer;
