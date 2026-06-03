import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

/**
 * One agent (workspace) entry. Sourced from `ListWorkspaces`, which reads
 * the inference-tracking {@code WORKSPACE} table — the same table that
 * backs {@code GetAgentHooks} / {@code SetAgentHooks}.
 *
 * <p><b>Important:</b> we deliberately do NOT use {@code META | MyProjects}
 * here, even though it also exposes "workspace"-typed entries.
 * {@code MyProjects} returns rows from the SEMOSS project catalog
 * ({@code PROJECT} table), while the agent's hook + system-prompt + MCP
 * config lives in a separate {@code WORKSPACE} table. The two are NOT
 * synchronized: a project with {@code projectType=WORKSPACE} created via
 * {@code CreateProject} does not get a corresponding {@code WORKSPACE}
 * row, so {@code GetAgentHooks} would 404 against it. Always create
 * agents via {@code AddWorkspace} (writes both tables atomically).
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
 * Extract workspace entries from a `ListWorkspaces` response. The reactor
 * returns a MAP shaped {@code { workspaces: [...], total_row_count: N }};
 * we normalize each row to {@code { workspaceId, name }}.
 */
function normalize(raw: unknown): AgentEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { workspaces?: unknown };
  const list = Array.isArray(r.workspaces) ? r.workspaces : [];
  const out: AgentEntry[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const w = row as Record<string, unknown>;
    const id = typeof w.workspace_id === "string" ? w.workspace_id : "";
    const name =
      typeof w.name === "string" && w.name.length > 0 ? w.name : id;
    if (id) out.push({ workspaceId: id, name });
  }
  return out;
}

/**
 * Fetch the user's agents (workspaces). Pixel:
 * `ListWorkspaces(limit=[25], offset=[0])`.
 */
export const fetchAgents = createAsyncThunk<
  { agents: AgentEntry[] },
  { runPixel: RunPixelFn }
>("agents/fetchAgents", async ({ runPixel }) => {
  const pixel = `ListWorkspaces(limit=[25], offset=[0]);`;
  const response = await runPixel(pixel);
  return { agents: normalize(response) };
});

/**
 * Create a new agent via {@code AddWorkspace(name='X')}. The reactor
 * generates the workspace_id, inserts rows in both the project catalog
 * AND the inference-tracking {@code WORKSPACE} table, and returns the
 * id as a CONST_STRING. The new id is then set as the active workspace.
 */
export const createAgent = createAsyncThunk<
  { workspaceId: string; name: string },
  { name: string; runPixel: RunPixelFn }
>("agents/createAgent", async ({ name, runPixel }) => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Agent name is required");
  }
  // Escape single quotes so the pixel string stays well-formed.
  const safe = trimmed.replace(/'/g, "\\'");
  const pixel = `AddWorkspace(name='${safe}');`;
  const response = await runPixel(pixel);

  // AddWorkspace returns a String wrapped in either a NounMetadata-style
  // payload or just the raw id, depending on how the runPixel adapter
  // unwraps it. Be defensive.
  let workspaceId = "";
  if (typeof response === "string") {
    workspaceId = response;
  } else if (response && typeof response === "object") {
    const r = response as Record<string, unknown>;
    if (typeof r.workspace_id === "string") workspaceId = r.workspace_id;
    else if (typeof r.value === "string") workspaceId = r.value;
    else if (typeof r.output === "string") workspaceId = r.output;
  }
  if (!workspaceId) {
    throw new Error("AddWorkspace did not return a workspace id");
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
      // the next fetchAgents() refresh will overwrite this with the
      // server's canonical list.
      state.agents = [
        { workspaceId: action.payload.workspaceId, name: action.payload.name },
        ...state.agents,
      ];
    });
  },
});

export const { setAgents } = agentsSlice.actions;
export default agentsSlice.reducer;
