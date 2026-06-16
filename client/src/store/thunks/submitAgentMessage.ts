import type { AppDispatch, RootState } from "@/store";
import { parseSlashCommands } from "@/lib/parseSlashCommands";
import {
  addMessage,
  setEffort,
  setInputMessage,
  setThinkingEnabled,
} from "../slices/chatSlice";
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
  runPixel: RunPixelFn;
  runPixelAsync: RunPixelAsyncFn;
  getPixelAsyncResult: GetPixelAsyncResultFn;
  getPixelJobStreaming: GetPixelJobStreamingFn;
};

export const submitAgentMessage =
  ({
    message,
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

    const stateBefore = getState();

    const parsed = parseSlashCommands(trimmedMessage, {
      effort: stateBefore.chat.effort,
      thinkingEnabled: stateBefore.chat.thinkingEnabled,
    });

    if (parsed.effortUpdate) {
      dispatch(setEffort(parsed.effortUpdate));
    }
    if (parsed.thinkingUpdate !== undefined) {
      const next =
        parsed.thinkingUpdate === "toggle"
          ? !stateBefore.chat.thinkingEnabled
          : parsed.thinkingUpdate;
      dispatch(setThinkingEnabled(next));
    }

    for (const line of parsed.feedback) {
      dispatch(addMessage({ role: "system", content: line }));
    }

    if (!parsed.shouldSend) {
      dispatch(setInputMessage(""));
      return;
    }

    const outboundMessage = parsed.cleanedMessage;

    const stateAfter = getState();
    const { projectId, messages, effort, thinkingEnabled } = stateAfter.chat;
    const hasExistingConversationContent =
      stateAfter.transcript.events.length > 0 ||
      messages.some((chatMessage) => chatMessage.role !== "system");

    dispatch(addMessage({ role: "user", content: outboundMessage }));

    const effortForThisTurn = parsed.effortOneShot ?? effort;
    const thinkingForThisTurn =
      parsed.effortOneShot !== undefined ? true : thinkingEnabled;

    dispatch(
      runAgentHarness({
        message: outboundMessage,
        shouldGenerateRoomName: !hasExistingConversationContent,
        runPixel,
        runPixelAsync,
        getPixelAsyncResult,
        getPixelJobStreaming,
        projectId,
        effort: effortForThisTurn,
        thinkingEnabled: thinkingForThisTurn,
      }),
    );
    dispatch(setInputMessage(""));
  };
