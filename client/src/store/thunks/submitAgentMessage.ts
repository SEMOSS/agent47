import type { AppDispatch, RootState } from "@/store";
import type { StreamingResponse } from "@/contexts/AppContext";
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
type GetPixelJobStreamingFn = (jobId: string) => Promise<StreamingResponse>;

type SubmitAgentMessageArgs = {
  message: string;
  imageDataUris?: string[];
  runPixel: RunPixelFn;
  runPixelAsync: RunPixelAsyncFn;
  getPixelAsyncResult: GetPixelAsyncResultFn;
  getPixelJobStreaming: GetPixelJobStreamingFn;
};

const DEFAULT_IMAGE_ONLY_PROMPT = "Please analyze the attached image.";

export const submitAgentMessage =
  ({
    message,
    imageDataUris = [],
    runPixel,
    runPixelAsync,
    getPixelAsyncResult,
    getPixelJobStreaming,
  }: SubmitAgentMessageArgs) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const trimmedMessage = message.trim();
    const imagesForThisTurn = imageDataUris.filter(Boolean);
    if (!trimmedMessage && imagesForThisTurn.length === 0) {
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

    if (!parsed.shouldSend && imagesForThisTurn.length === 0) {
      dispatch(setInputMessage(""));
      return;
    }

    const outboundMessage =
      parsed.cleanedMessage ||
      (imagesForThisTurn.length === 1
        ? DEFAULT_IMAGE_ONLY_PROMPT
        : "Please analyze the attached images.");

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
        imageDataUris: imagesForThisTurn,
      }),
    );
    dispatch(setInputMessage(""));
  };
