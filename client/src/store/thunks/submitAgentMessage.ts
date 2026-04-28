import type { AppDispatch, RootState } from "@/store";
import { addMessage, setInputMessage } from "../slices/chatSlice";
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

    const { projectId } = getState().chat;

    dispatch(addMessage({ role: "user", content: trimmedMessage }));
    dispatch(
      runAgentHarness({
        message: trimmedMessage,
        runPixel,
        runPixelAsync,
        getPixelAsyncResult,
        getPixelJobStreaming,
        projectId,
      }),
    );
    dispatch(setInputMessage(""));
  };
