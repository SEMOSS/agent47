import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { TranscriptHarness } from "@/types/transcript";
import { createProject, createReactProject } from "./createProjectSlice";
import { runAgentHarness } from "../thunks/runAgentHarness";

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

const initialState: ChatState = {
  roomId: createRoomId(),
  engineId: loadInitialEngineId(),
  engineDisplayName: loadInitialEngineDisplayName(),
  systemPrompt:
    "You are helping a user build and modify a SEMOSS application. Work exclusively within the current working directory — do not read, write, or traverse files in parent directories. Use the \`BuildAndPublishApp\` tool only when the task requires building and publishing the React/Vite frontend, and pass the project id: \`${projectId}\`. If the user only wants to publish changes that do not require a React build, use the standard publish reactor with the app/project id instead of \`BuildAndPublishApp\`. Node, npm, pnpm, and other JavaScript build tooling are not available via Bash. Do not invoke \`BuildAndPublishApp\` merely because the user said 'publish'; first decide whether a frontend build is actually needed. When the user's request requires platform-specific code (calling models, querying databases, working with storage or vector catalogs), consult the relevant skill before writing code. Skill descriptions cover when to use them. If an agent-memory skill is available, follow its guidance for recalling and persisting lessons.",
  projectId: loadInitialProjectId(),
  permissionMode: "acceptEdits",
  harnessType: loadInitialHarnessType(),
  inputMessage: "",
  messages: [],
  pendingMessageId: null,
  iframeRefreshKey: 0,
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
    },
    startNewRoom(state) {
      state.roomId = createRoomId();
      state.messages = [];
      state.pendingMessageId = null;
      state.inputMessage = "";
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
      state.projectId = action.payload;
      state.roomId = createRoomId();
      state.iframeRefreshKey += 1;
      state.messages = [];
      state.pendingMessageId = null;
      state.inputMessage = "";
      writeLocalStorage(LAST_PROJECT_ID_KEY, action.payload);
    },
    setInputMessage(state, action: PayloadAction<string>) {
      state.inputMessage = action.payload;
    },
    bumpIframeRefresh(state) {
      state.iframeRefreshKey += 1;
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
      writeLocalStorage(LAST_PROJECT_ID_KEY, action.payload.projectId);
    });
    builder.addCase(createReactProject.fulfilled, (state, action) => {
      state.projectId = action.payload.projectId;
      state.roomId = createRoomId();
      state.iframeRefreshKey += 1;
      state.messages = [];
      state.pendingMessageId = null;
      state.inputMessage = "";
      writeLocalStorage(LAST_PROJECT_ID_KEY, action.payload.projectId);
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
