import { createAsyncThunk } from "@reduxjs/toolkit";
import { parseTranscriptMessage } from "@/lib/parseTranscriptMessage";
import {
  createSetRoomForInsightPixel,
  sanitizeInsightFilePath,
  sanitizePixelArg,
} from "@/lib/pixelHelpers";
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

const sortHistoryEvents = (
  transcript: TranscriptEvent[],
): TranscriptEvent[] =>
  [...transcript]
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const aTime = Date.parse(a.event.timestamp);
      const bTime = Date.parse(b.event.timestamp);
      const aHasTime = Number.isFinite(aTime);
      const bHasTime = Number.isFinite(bTime);

      if (aHasTime && bHasTime && aTime !== bTime) {
        return aTime - bTime;
      }

      if (aHasTime !== bHasTime) {
        return aHasTime ? -1 : 1;
      }

      if (
        a.event.kind === "attachment" &&
        b.event.kind === "user-prompt" &&
        a.event.promptId === b.event.promptId
      ) {
        return -1;
      }

      if (
        a.event.kind === "user-prompt" &&
        b.event.kind === "attachment" &&
        a.event.promptId === b.event.promptId
      ) {
        return 1;
      }

      return a.index - b.index;
    })
    .map(({ event }) => event);

const loadHistoryForHarness = async (
  roomId: string,
  harnessType: ChatState["harnessType"],
  runPixel: RunPixelFn,
): Promise<TranscriptEvent[]> => {
  const transcript =
    harnessType === "claude_code"
      ? await loadClaudeCodeHistory(roomId, runPixel)
      : await loadGitHubCopilotHistory(roomId, runPixel);

  return sortHistoryEvents(transcript);
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
      events: sortHistoryEvents(copilotEvents),
    };
  }

  if (claudeEvents.length > 0 && copilotEvents.length === 0) {
    return {
      harnessType: "claude_code",
      events: sortHistoryEvents(claudeEvents),
    };
  }

  if (fallbackHarnessType === "github_copilot_py") {
    return {
      harnessType: "github_copilot_py",
      events: sortHistoryEvents(copilotEvents),
    };
  }

  return {
    harnessType: "claude_code",
    events: sortHistoryEvents(claudeEvents),
  };
};

const toDataUrl = (mimeType: string, value: string) =>
  value.startsWith("data:")
    ? value
    : `data:${mimeType || "application/octet-stream"};base64,${value}`;

const hydrateAttachmentPreviews = async (
  events: TranscriptEvent[],
  runPixel: RunPixelFn,
): Promise<TranscriptEvent[]> =>
  Promise.all(
    events.map(async (event) => {
      if (event.kind !== "attachment" || event.dataUrl || !event.path) {
        return event;
      }

      try {
        const base64 = await runPixel<string>(
          `GetInsightAssetsBase64(filePath='${sanitizePixelArg(
            sanitizeInsightFilePath(event.path),
          )}');`,
        );

        if (!base64) {
          return event;
        }

        return {
          ...event,
          dataUrl: toDataUrl(event.mimeType, base64),
        };
      } catch (error) {
        console.warn(
          "Failed to hydrate attachment preview for transcript event:",
          event.path,
          error,
        );
        return event;
      }
    }),
  );

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
      await runPixel(createSetRoomForInsightPixel(roomId));

      const { harnessType, events: rawEvents } = storedHarnessType
        ? {
            harnessType: storedHarnessType,
            events: await loadHistoryForHarness(
              roomId,
              storedHarnessType,
              runPixel,
            ),
          }
        : await inferHistoryFromRoom(roomId, fallbackHarnessType, runPixel);
      const events = await hydrateAttachmentPreviews(rawEvents, runPixel);

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
