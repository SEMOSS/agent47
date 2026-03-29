import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import { createProject, createReactProject } from "./createProjectSlice";
import { callClaudeCode } from "../thunks/callClaudeCode";

export type ChatMessage = {
  id: string;
  author: string;
  role: "system" | "assistant" | "user";
  time: string;
  content: string;
  status?: "loading" | "complete" | "error";
};

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions";

export interface ChatState {
  roomId: string;
  engineId: string;
  systemPrompt: string;
  projectId: string;
  permissionMode: PermissionMode;
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
  systemPrompt:
    "Only read and modify files within the current working directory. Do not traverse or inspect parent directories.",
  projectId: "",
  permissionMode: "acceptEdits",
  inputMessage: "",
  messages: [],
  pendingMessageId: null,
  iframeRefreshKey: 0,
};

const createMessageId = () =>
  `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatMessageTime = (value: Date) =>
  value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const getAuthorLabel = (role: ChatMessage["role"]) => {
  switch (role) {
    case "assistant":
      return "Claude Code";
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
    setSystemPrompt(state, action: PayloadAction<string>) {
      state.systemPrompt = action.payload;
    },
    setProjectId(state, action: PayloadAction<string>) {
      state.projectId = action.payload;
    },
    setPermissionMode(state, action: PayloadAction<PermissionMode>) {
      state.permissionMode = action.payload;
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
            content,
          },
        };
      },
    },
  },
  extraReducers: (builder) => {
    builder.addCase(callClaudeCode.pending, (state) => {
      const pendingId = createMessageId();
      state.pendingMessageId = pendingId;
      state.messages.push({
        id: pendingId,
        author: getAuthorLabel("assistant"),
        role: "assistant",
        time: formatMessageTime(new Date()),
        content: "Thinking...",
        status: "loading",
      });
    });
    builder.addCase(callClaudeCode.fulfilled, (state, action) => {
      const pendingId = state.pendingMessageId;
      if (pendingId) {
        const pendingMessage = state.messages.find(
          (message) => message.id === pendingId,
        );
        if (pendingMessage) {
          pendingMessage.content = action.payload.response;
          pendingMessage.status = "complete";
          state.pendingMessageId = null;
          return;
        }
      }
      state.messages.push({
        id: createMessageId(),
        author: getAuthorLabel("assistant"),
        role: "assistant",
        time: formatMessageTime(new Date()),
        content: action.payload.response,
        status: "complete",
      });
      state.pendingMessageId = null;
    });
    builder.addCase(callClaudeCode.rejected, (state, action) => {
      const pendingId = state.pendingMessageId;
      if (pendingId) {
        const pendingMessage = state.messages.find(
          (message) => message.id === pendingId,
        );
        if (pendingMessage) {
          pendingMessage.content = "Something went wrong. Please try again.";
          pendingMessage.status = "error";
          state.pendingMessageId = null;
          return;
        }
      }
      state.messages.push({
        id: createMessageId(),
        author: getAuthorLabel("assistant"),
        role: "assistant",
        time: formatMessageTime(new Date()),
        content: "Something went wrong. Please try again.",
        status: "error",
      });
      state.pendingMessageId = null;
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
  setSystemPrompt,
  setProjectId,
  setPermissionMode,
  setActiveProject,
  setInputMessage,
  bumpIframeRefresh,
  addMessage,
} = chatSlice.actions;
export { createRoomId };
export default chatSlice.reducer;
