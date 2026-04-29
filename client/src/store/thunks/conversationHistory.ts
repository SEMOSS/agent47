import { createAsyncThunk } from "@reduxjs/toolkit";
import { parseTranscriptMessage } from "@/lib/parseTranscriptMessage";
import type { TranscriptEvent } from "@/types/transcript";
import {
  type ChatState,
  type ConversationRoom,
  setConversationList,
  setHarnessType,
  setIsLoadingConversations,
  setMessages,
  setRoomId,
  updateConversationRoomName,
  writeLastRoomId,
} from "../slices/chatSlice";
import { clearTranscript, setTranscriptEvents } from "../slices/transcriptSlice";

type RunPixelFn = <T = unknown>(pixelString: string | string[]) => Promise<T>;
const sanitizePixelArg = (value: string) => value.replace(/'/g, '"');

type RawRoom = {
  ROOM_ID?: string;
  ROOM_NAME?: string;
  DATE_CREATED?: string;
  PINNED?: boolean;
  WORKSPACE_ID?: string;
};

type RoomOptions = {
  harnessType?: string;
  targetProjectId?: string;
};

const readHarnessType = (
  value: unknown,
): ChatState["harnessType"] | undefined => {
  if (value === "github_copilot" || value === "github_copilot_py") {
    return "github_copilot_py";
  }
  if (value === "claude_code") {
    return "claude_code";
  }
  return undefined;
};

const normalizeRoomOptions = (value: unknown): RoomOptions | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      return normalizeRoomOptions(JSON.parse(value));
    } catch {
      return undefined;
    }
  }

  if (Array.isArray(value)) {
    return normalizeRoomOptions(value[0]);
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if ("roomOptions" in record) {
    return normalizeRoomOptions(record.roomOptions);
  }

  return {
    harnessType:
      typeof record.harnessType === "string" ? record.harnessType : undefined,
    targetProjectId:
      typeof record.targetProjectId === "string"
        ? record.targetProjectId
        : undefined,
  };
};

const loadClaudeCodeHistory = async (
  roomId: string,
  runPixel: RunPixelFn,
): Promise<TranscriptEvent[]> => {
  const rawEvents = await runPixel<unknown[]>(
    `GetClaudeCodeTranscriptHistory(roomId='${roomId}');`,
  );

  return (rawEvents ?? []).flatMap((rawEvent) =>
    parseTranscriptMessage(rawEvent, "claude_code"),
  );
};

const loadGitHubCopilotHistory = async (
  roomId: string,
  runPixel: RunPixelFn,
): Promise<TranscriptEvent[]> => {
  const rawEvents = await runPixel<unknown[]>(
    `GetGitHubCopilotTranscriptHistory(roomId='${roomId}');`,
  );

  return (rawEvents ?? []).flatMap((rawEvent) =>
    parseTranscriptMessage(rawEvent, "github_copilot_py"),
  );
};

const loadHistoryForHarness = async (
  roomId: string,
  harnessType: ChatState["harnessType"],
  runPixel: RunPixelFn,
): Promise<TranscriptEvent[]> => {
  if (harnessType === "claude_code") {
    return loadClaudeCodeHistory(roomId, runPixel);
  }

  return loadGitHubCopilotHistory(roomId, runPixel);
};

const inferHistoryFromRoom = async (
  roomId: string,
  fallbackHarnessType: ChatState["harnessType"],
  runPixel: RunPixelFn,
): Promise<{
  harnessType: ChatState["harnessType"];
  events: TranscriptEvent[];
}> => {
  const [copilotResult, claudeResult] = await Promise.allSettled([
    loadGitHubCopilotHistory(roomId, runPixel),
    loadClaudeCodeHistory(roomId, runPixel),
  ]);

  const copilotEvents =
    copilotResult.status === "fulfilled" ? copilotResult.value : [];
  const claudeEvents =
    claudeResult.status === "fulfilled" ? claudeResult.value : [];

  if (copilotEvents.length > 0 && claudeEvents.length === 0) {
    return {
      harnessType: "github_copilot_py",
      events: copilotEvents,
    };
  }

  if (claudeEvents.length > 0 && copilotEvents.length === 0) {
    return {
      harnessType: "claude_code",
      events: claudeEvents,
    };
  }

  if (fallbackHarnessType === "github_copilot_py") {
    return {
      harnessType: "github_copilot_py",
      events: copilotEvents,
    };
  }

  return {
    harnessType: "claude_code",
    events: claudeEvents,
  };
};

export const loadConversationHistory = createAsyncThunk<
  ConversationRoom[],
  { projectId: string; runPixel: RunPixelFn },
  { rejectValue: string; state: { chat: ChatState } }
>(
  "chat/loadConversationHistory",
  async ({ projectId, runPixel }, { dispatch, rejectWithValue }) => {
    if (!projectId) return [];

    dispatch(setIsLoadingConversations(true));

    try {
      const rooms = await runPixel<RawRoom[]>(
        `GetUserConversationRooms(roomOptionsSearch='${projectId}', sort='DESC');`,
      );

      const mapped: ConversationRoom[] = (rooms ?? [])
        .filter((room) => room.ROOM_ID)
        .map((room) => ({
          roomId: room.ROOM_ID ?? "",
          roomName: room.ROOM_NAME ?? "Untitled session",
          dateCreated: room.DATE_CREATED ?? "",
          pinned: room.PINNED ?? false,
        }));

      dispatch(setConversationList(mapped));
      return mapped;
    } catch (error) {
      console.error("loadConversationHistory failed:", error);
      return rejectWithValue("Failed to load conversation history.");
    } finally {
      dispatch(setIsLoadingConversations(false));
    }
  },
);

export const resumeConversation = createAsyncThunk<
  void,
  { roomId: string; projectId: string; runPixel: RunPixelFn },
  { rejectValue: string; state: { chat: ChatState } }
>(
  "chat/resumeConversation",
  async ({ roomId, projectId, runPixel }, { dispatch, getState, rejectWithValue }) => {
    try {
      const fallbackHarnessType = getState().chat.harnessType;
      const rawRoomOptions = await runPixel<unknown>(
        `GetRoomOptions(roomId='${roomId}');`,
      );
      const roomOptions = normalizeRoomOptions(rawRoomOptions);
      const storedHarnessType = readHarnessType(roomOptions?.harnessType);

      dispatch(setRoomId(roomId));
      dispatch(setMessages([]));
      dispatch(clearTranscript());

      const { harnessType, events } = storedHarnessType
        ? {
            harnessType: storedHarnessType,
            events: await loadHistoryForHarness(
              roomId,
              storedHarnessType,
              runPixel,
            ),
          }
        : await inferHistoryFromRoom(roomId, fallbackHarnessType, runPixel);

      dispatch(setHarnessType(harnessType));
      dispatch(setTranscriptEvents(events));

      writeLastRoomId(projectId, roomId);
    } catch (error) {
      console.error("resumeConversation failed:", error);
      return rejectWithValue("Failed to resume conversation.");
    }
  },
);

export const renameConversationRoom = createAsyncThunk<
  string,
  { roomId: string; roomName: string; runPixel: RunPixelFn },
  { rejectValue: string; state: { chat: ChatState } }
>(
  "chat/renameConversationRoom",
  async ({ roomId, roomName, runPixel }, { dispatch, rejectWithValue }) => {
    const trimmedRoomName = roomName.trim();
    if (!roomId || !trimmedRoomName) {
      return rejectWithValue("Room name is required.");
    }

    try {
      await runPixel<boolean>(
        `RenameRoom(roomId=['${roomId}'], name=['${sanitizePixelArg(trimmedRoomName)}']);`,
      );
      dispatch(
        updateConversationRoomName({
          roomId,
          roomName: trimmedRoomName,
        }),
      );
      return trimmedRoomName;
    } catch (error) {
      console.error("renameConversationRoom failed:", error);
      return rejectWithValue("Failed to rename conversation.");
    }
  },
);
