import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ChatState } from "../slices/chatSlice";
import type { MCPState } from "../slices/mcpSlice";

type RunPixelFn = <T = unknown>(pixelString: string | string[]) => Promise<T>;

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
        (mcp) => `{'id':'${mcp.id}','name':'${mcp.name}','type':'${mcp.type}'}`,
      );
      const pixelString = `UpdateRoomOptions(roomId='${roomId}', roomOptions=[{"instructions":'${safeInstructions}', "modelId":'${model}', "mcp":[${mcpStrings.join(",")}] }] )`;
      console.log("Calling UpdateRoomOptions with pixelString:", pixelString);
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

export const callClaudeCode = createAsyncThunk<
  { response: string },
  {
    message: string;
    runPixel: RunPixelFn;
    projectId?: string;
    engineId?: string;
  },
  { rejectValue: string; state: { chat: ChatState; mcp: MCPState } }
>(
  "chat/callClaudeCode",
  async (
    { message, runPixel, projectId },
    { rejectWithValue, getState, dispatch },
  ) => {
    try {
      const { chat, mcp } = getState();
      const targetProjectId = projectId ?? chat.projectId;
      const selectedMcps = [];
      for (const x of mcp.selectedMcps) {
        const mcpDetails: MCPDetails = {
          id: x.project_id,
          name: x.project_name,
          type: "PROJECT",
        };
        selectedMcps.push(mcpDetails);
      }
      const updateRoomOptionsPixel = createUpdateRoomOptionsPixel(
        chat.roomId,
        chat.systemPrompt,
        selectedMcps,
        chat.engineId,
      );

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
      const allowedTools = [];
      for (const tool of tools) {
        allowedTools.push(`"${tool}"`);
      }
      const safeMessage = sanitizePixelArg(message);

      const paramMap = {
        project: targetProjectId,
        allowedTools: `[${allowedTools}]`,
        permissionMode: chat.permissionMode,
      };

      // const pixelString = `ClaudeCode(project='${targetProjectId}', command='${safeMessage}', roomId='${chat.roomId}', allowedTools=[${allowedTools}], permissionMode='${chat.permissionMode}') ;`;
      const pixelString = `RunAgent(roomId='${chat.roomId}', engine='${chat.engineId}', command='${safeMessage}', harnessType="claude_code", maxReflections=20, paramValues=[${JSON.stringify(paramMap)}]) ;`;

      console.log("Calling Claude Code with pixelString:", pixelString);

      const response = await runPixel<string>([
        updateRoomOptionsPixel,
        pixelString,
      ]);

      console.log("Claude Code raw response:", response);

      // const publishPixel = `PublishProject(project='${targetProjectId}', release=true)`;
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
      console.log("Claude Code response:", response);
      return { response: response[1] };
    } catch (error) {
      return rejectWithValue("Failed to call Claude Code.");
    }
  },
);
