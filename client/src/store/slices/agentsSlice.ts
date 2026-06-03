import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

/**
 * One agent (workspace) entry returned by
 * `META | MyProjects(... type="WORKSPACE" ...)`. The pixel response uses
 * `project_*` field names (sometimes `app_*` on older servers); we
 * normalize to `{ workspaceId, name }` so downstream components don't
 * have to care about server-side naming drift.
 */
export interface AgentEntry {
  workspaceId: string;
  name: string;
}

export interface AgentsState {
  agents: AgentEntry[];
  isLoading: boolean;
}

const initialState: AgentsState = {
  agents: [],
  isLoading: false,
};

/**
 * Defensive normalizer: the META | MyProjects response shape can vary
 * across server versions (`project_id` vs `projectId` vs `app_id`, and
 * similar for name). Mirror `getProjectId`/`getProjectName` from
 * HomePage.tsx so the picker keeps working if a server is upgraded.
 */
function normalize(raw: unknown): AgentEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id =
      (r.project_id as string) ??
      (r.projectId as string) ??
      (r.project as string) ??
      (r.app_id as string) ??
      (r.id as string) ??
      "";
    const name =
      (r.project_name as string) ??
      (r.projectName as string) ??
      (r.app_name as string) ??
      (r.name as string) ??
      "";
    if (typeof id === "string" && id.trim().length > 0) {
      out.push({ workspaceId: id, name: name || id });
    }
  }
  return out;
}

/**
 * Fetch the user's agents (workspaces). Pixel:
 * `META | MyProjects(filterWord=["<encode></encode>"], type="WORKSPACE",
 *  limit=[25], offset=[0])`.
 */
export const fetchAgents = createAsyncThunk<
  { agents: AgentEntry[] },
  { runPixel: RunPixelFn }
>("agents/fetchAgents", async ({ runPixel }) => {
  const pixel = `META | MyProjects(filterWord=["<encode></encode>"], type="WORKSPACE", limit=[25], offset=[0]);`;
  const response = await runPixel(pixel);
  return { agents: normalize(response) };
});

/**
 * Create a new workspace-typed project, then return the new id so the
 * caller can `setWorkspaceId(newId)` immediately. Reuses the existing
 * `CreateProject` reactor (the same one Build → New Project uses for
 * CODE projects) with `projectType=['WORKSPACE']` instead of `['CODE']`.
 */
export const createAgent = createAsyncThunk<
  { workspaceId: string; name: string },
  { name: string; runPixel: RunPixelFn }
>("agents/createAgent", async ({ name, runPixel }) => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Agent name is required");
  }
  // Escape single quotes to avoid breaking the pixel string.
  const safe = trimmed.replace(/'/g, "\\'");
  const pixel = `CreateProject(project='${safe}', portal=['true'], projectType=['WORKSPACE']);`;
  const response = (await runPixel(pixel)) as
    | { project_id?: string; projectId?: string; id?: string }
    | undefined;
  const workspaceId =
    response?.project_id ?? response?.projectId ?? response?.id ?? "";
  if (!workspaceId) {
    throw new Error("CreateProject did not return a project_id");
  }
  return { workspaceId, name: trimmed };
});

const agentsSlice = createSlice({
  name: "agents",
  initialState,
  reducers: {
    setAgents(state, action: PayloadAction<AgentEntry[]>) {
      state.agents = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAgents.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(fetchAgents.fulfilled, (state, action) => {
      state.isLoading = false;
      state.agents = action.payload.agents;
    });
    builder.addCase(fetchAgents.rejected, (state) => {
      state.isLoading = false;
    });
    builder.addCase(createAgent.fulfilled, (state, action) => {
      // Optimistically prepend so the new agent shows up immediately;
      // a follow-up fetchAgents() will overwrite this with the server's
      // canonical list (including any auto-populated metadata).
      state.agents = [
        { workspaceId: action.payload.workspaceId, name: action.payload.name },
        ...state.agents,
      ];
    });
  },
});

export const { setAgents } = agentsSlice.actions;
export default agentsSlice.reducer;
