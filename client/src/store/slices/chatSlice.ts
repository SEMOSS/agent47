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

const initialState: ChatState = {
  roomId: createRoomId(),
  engineId: "aa876e7e-e78e-404d-b7db-1a44236bc2a5",
  engineDisplayName: "",
  systemPrompt:
    "Only read and modify files within the current working directory. Do not traverse or inspect parent directories. Do not try to build the front end using bash/node/npm/pnpm. Use the <BuildAndPublishApp> tool which will safely and securely compile it. You should use this at the end of your messages if you make file changes. If an agent-memory skill is available, follow its guidance for recalling and persisting lessons.",
  projectId: "",
  permissionMode: "acceptEdits",
  harnessType: "claude_code",
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
      return harnessType === "github_copilot" ? "GitHub Copilot" : "Agent";
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
    },
    setEngineDisplayName(state, action: PayloadAction<string>) {
      state.engineDisplayName = action.payload;
    },
    setSystemPrompt(state, action: PayloadAction<string>) {
      state.systemPrompt = action.payload;
    },
    setProjectId(state, action: PayloadAction<string>) {
      state.projectId = action.payload;
    },
    setPermissionMode(state, action: PayloadAction<PermissionMode>) {
      state.permissionMode = action.payload;
    },
    setHarnessType(state, action: PayloadAction<HarnessType>) {
      state.harnessType = action.payload;
    },
    setActiveProject(state, action: PayloadAction<string>) {
      state.projectId = action.payload;
      state.roomId = createRoomId();
      state.iframeRefreshKey += 1;
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
    });
    builder.addCase(createReactProject.fulfilled, (state, action) => {
      state.projectId = action.payload.projectId;
      state.roomId = createRoomId();
      state.iframeRefreshKey += 1;
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
