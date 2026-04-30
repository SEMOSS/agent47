import type { AppDispatch, RootState } from "@/store";
import { v4 as uuidv4 } from "uuid";
import {
  clearPendingAttachments,
  setInputMessage,
} from "../slices/chatSlice";
import { addTranscriptEvent } from "../slices/transcriptSlice";
import { runAgentHarness } from "./runAgentHarness";

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
type GetPixelJobStreamingFn = (
  jobId: string,
) => Promise<{
  message: Array<{
    stream_type: "content" | "thinking" | "tool";
    data: Record<string, unknown>;
  }>;
  status: string;
}>;

type SubmitAgentMessageArgs = {
  message: string;
  insightId: string;
  runPixel: RunPixelFn;
  runPixelAsync: RunPixelAsyncFn;
  getPixelAsyncResult: GetPixelAsyncResultFn;
  getPixelJobStreaming: GetPixelJobStreamingFn;
};

export const submitAgentMessage =
  ({
    message,
    insightId,
    runPixel,
    runPixelAsync,
    getPixelAsyncResult,
    getPixelJobStreaming,
  }: SubmitAgentMessageArgs) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    const state = getState();
    const { projectId, messages, pendingAttachments, harnessType } = state.chat;
    const hasExistingConversationContent =
      state.transcript.events.length > 0 ||
      messages.some((chatMessage) => chatMessage.role !== "system");
    const promptId = uuidv4();
    const timestamp = new Date().toISOString();

    dispatch(
      addTranscriptEvent({
        kind: "user-prompt",
        promptId,
        text: trimmedMessage,
        timestamp,
        harnessType,
      }),
    );
    dispatch(
      runAgentHarness({
        message: trimmedMessage,
        promptId,
        attachments: pendingAttachments,
        insightId,
        shouldGenerateRoomName: !hasExistingConversationContent,
        runPixel,
        runPixelAsync,
        getPixelAsyncResult,
        getPixelJobStreaming,
        projectId,
      }),
    );
    dispatch(setInputMessage(""));
    dispatch(clearPendingAttachments());
  };
