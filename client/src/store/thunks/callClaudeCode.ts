import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ChatState } from "../slices/chatSlice";
import {
	addMessage,
	updateStreamingContent,
	completeStreamingMessage,
	failStreamingMessage,
} from "../slices/chatSlice";
import type { MCPState } from "../slices/mcpSlice";
import type { StreamingResponse } from "@/contexts/AppContext";

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

const sanitizePixelArg = (value: string) => value.replace(/'/g, '"');

interface MCPDetails {
	id: string;
	name: string;
	type: string;
}

const createUpdateRoomOptionsPixel = (
	roomId: string,
	instructions: string,
	mcps: MCPDetails[],
	model: string,
) => {
	const safeInstructions = sanitizePixelArg(instructions);
	const mcpStrings = mcps.map(
		(mcp) => `{'id':'${mcp.id}','name':'${mcp.name}','type':'${mcp.type}'}`,
	);
	return `UpdateRoomOptions(roomId='${roomId}', roomOptions=[{"instructions":'${safeInstructions}', "modelId":'${model}', "mcp":[${mcpStrings.join(",")}] }] )`;
};

export const updateRoomOptions = createAsyncThunk<
	{ response: boolean },
	{
		roomId: string;
		instructions: string;
		mcps: MCPDetails[];
		model: string;
		runPixel: RunPixelFn;
	},
	{ rejectValue: string; state: { chat: ChatState; mcp: MCPState } }
>(
	"chat/updateRoomOptions",
	async (
		{ roomId, instructions, mcps, model, runPixel },
		{ rejectWithValue },
	) => {
		try {
			const safeInstructions = sanitizePixelArg(instructions);
			const mcpStrings = mcps.map(
				(mcp) =>
					`{'id':'${mcp.id}','name':'${mcp.name}','type':'${mcp.type}'}`,
			);
			const pixelString = `UpdateRoomOptions(roomId='${roomId}', roomOptions=[{"instructions":'${safeInstructions}', "modelId":'${model}', "mcp":[${mcpStrings.join(",")}] }] )`;
			console.log(
				"Calling UpdateRoomOptions with pixelString:",
				pixelString,
			);
			const response = await runPixel<boolean>(pixelString);
			console.log("UpdateRoomOptions response:", response);
			return {
				response,
			};
		} catch (error) {
			console.error("Failed to call UpdateRoomOptions:", error);
			return rejectWithValue("Failed to call UpdateRoomOptions.");
		}
	},
);

/** Terminal statuses that mean polling should stop */
const TERMINAL_STATUSES = new Set(["ProgressComplete", "Complete", "Error"]);

/** How often to poll for streaming content (ms) */
const POLLING_INTERVAL_MS = 300;

export const callClaudeCode = createAsyncThunk<
	{ response: string },
	{
		message: string;
		runPixel: RunPixelFn;
		runPixelAsync: RunPixelAsyncFn;
		getPixelAsyncResult: GetPixelAsyncResultFn;
		getPixelJobStreaming: GetPixelJobStreamingFn;
		projectId?: string;
		engineId?: string;
	},
	{ rejectValue: string; state: { chat: ChatState; mcp: MCPState } }
>(
	"chat/callClaudeCode",
	async (
		{
			message,
			runPixel,
			runPixelAsync,
			getPixelAsyncResult,
			getPixelJobStreaming,
			projectId,
		},
		{ rejectWithValue, getState, dispatch },
	) => {
		try {
			const { chat, mcp } = getState();
			const targetProjectId = projectId ?? chat.projectId;
			const pendingId = chat.pendingMessageId;

			// Build MCP list
			const selectedMcps: MCPDetails[] = mcp.selectedMcps.map((x) => ({
				id: x.project_id,
				name: x.project_name,
				type: "PROJECT",
			}));

			// 1. Update room options first (synchronous)
			const updateRoomOptionsPixel = createUpdateRoomOptionsPixel(
				chat.roomId,
				chat.systemPrompt,
				selectedMcps,
				chat.engineId,
			);
			await runPixel(updateRoomOptionsPixel);

			// 2. Build the RunAgent pixel
			const tools = [
				"Skill",
				"Bash",
				"BashOutput",
				"KillBash",
				"Read",
				"Write",
				"Edit",
				"MultiEdit",
				"NotebookEdit",
				"Glob",
				"Grep",
				"LS",
				"WebSearch",
				"WebFetch",
				"TodoRead",
				"TodoWrite",
				"Task",
				"AskUserQuestion",
			];
			const allowedTools = tools.map((t) => `"${t}"`);
			const safeMessage = sanitizePixelArg(message);

			const paramMap = {
				project: targetProjectId,
				allowedTools: `[${allowedTools}]`,
				permissionMode: chat.permissionMode,
			};

			const pixelString = `RunAgent(roomId='${chat.roomId}', engine='${chat.engineId}', command='${safeMessage}', harnessType="${chat.harnessType}", maxReflections=20, paramValues=[${JSON.stringify(paramMap)}]) ;`;

			console.log(
				"Calling Claude Code (streaming) with pixelString:",
				pixelString,
			);

			// 3. Start async execution
			const { jobId } = await runPixelAsync(pixelString);

			if (!jobId) {
				throw new Error("No job ID returned from pixel execution");
			}

			// 4. Poll for streaming content
			let isPolling = true;
			let accumulatedContent = "";

			while (isPolling) {
				try {
					const response = await getPixelJobStreaming(jobId);

					// Process each streaming message chunk
					if (response && response.message.length > 0) {
						for (const msg of response.message) {
							if (
								msg.stream_type === "content" &&
								msg.data.content
							) {
								// Append new content chunk
								accumulatedContent += msg.data.content;
							} else if (
								msg.stream_type === "thinking" &&
								msg.data.thinking
							) {
								// Show thinking as a system message
								dispatch(
									addMessage({
										role: "system",
										content: `_Thinking: ${(msg.data.thinking as string).slice(0, 300)}${(msg.data.thinking as string).length > 300 ? "..." : ""}_`,
									}),
								);
							} else if (msg.stream_type === "tool") {
								// Show tool calls as system step messages
								const toolName =
									(msg.data.tool_name as string) ??
									(msg.data.name as string) ??
									(msg.data.function_name as string);
								const toolSummary =
									(msg.data.content as string) ??
									(toolName ? `Tool: ${toolName}` : null);
								if (toolSummary) {
									dispatch(
										addMessage({
											role: "system",
											content: toolSummary,
										}),
									);
								}
							}
						}

						// Update the streaming message in the store
						if (accumulatedContent && pendingId) {
							dispatch(
								updateStreamingContent({
									id: pendingId,
									content: accumulatedContent,
								}),
							);
						}
					}

					// Check for terminal status
					if (TERMINAL_STATUSES.has(response.status)) {
						isPolling = false;

						if (response.status === "Error") {
							if (pendingId) {
								dispatch(
									failStreamingMessage({
										id: pendingId,
										error: "An error occurred while processing your request.",
									}),
								);
							}
							throw new Error(
								"Streaming job encountered an error",
							);
						}
					}

					if (isPolling) {
						await new Promise((resolve) =>
							setTimeout(resolve, POLLING_INTERVAL_MS),
						);
					}
				} catch (error) {
					isPolling = false;
					throw error;
				}
			}

			// 5. Get the final result
			const result = await getPixelAsyncResult<[unknown, string]>(jobId);

			if (result.errors.length > 0) {
				throw new Error(result.errors.join(""));
			}

			// Extract the response (second result from the dual pixel call, or first if only one)
			const finalResponse =
				result.results.length > 1
					? (result.results[1].output as string)
					: (result.results[0].output as string);

			// 6. Mark message as complete with the final response
			if (pendingId) {
				dispatch(
					completeStreamingMessage({
						id: pendingId,
						content: finalResponse || accumulatedContent,
					}),
				);
			}

			// 7. Build and publish
			const buildAndPublishPixel = `BuildAndPublishApp(project='${targetProjectId}')`;
			try {
				await runPixel(buildAndPublishPixel);
			} catch (error) {
				console.warn("BuildAndPublishApp failed:", error);
			} finally {
				setTimeout(() => {
					dispatch({ type: "chat/bumpIframeRefresh" });
				}, 500);
			}

			console.log("Claude Code streaming response:", finalResponse);
			return { response: finalResponse || accumulatedContent };
		} catch (error) {
			console.error("callClaudeCode streaming error:", error);

			const { chat } = getState();
			if (chat.pendingMessageId) {
				dispatch(
					failStreamingMessage({
						id: chat.pendingMessageId,
						error: "Something went wrong. Please try again.",
					}),
				);
			}

			return rejectWithValue("Failed to call Claude Code.");
		}
	},
);
