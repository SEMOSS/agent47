import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

/**
 * One entry in `WORKSPACE.CONFIG_JSON.hooks[]`. Backend persists the
 * full entry as-is, so kind-specific fields like `pixel` and `events`
 * round-trip through the config.
 */
export interface HookEntry {
  /** Required. Registered hook kind (e.g. "pixel", "git_commit"). */
  kind: string;
  /** Required when kind === "pixel". The Pixel expression to fire. */
  pixel?: string;
  /**
   * Optional lifecycle event filter. Empty/omitted means fire on every
   * event the hook gets called for. Valid values:
   * onRoomCreation, beforeRun, afterAgentInit, beforeTool, afterTool,
   * afterRun, beforeAgentDeInit.
   */
  events?: string[];
}

export interface HooksState {
  /** Current `WORKSPACE.CONFIG_JSON.hooks[]` for the active workspace. */
  hooks: HookEntry[];
  /** Hook kinds the backend knows about — drives the "add hook" dropdown. */
  knownKinds: string[];
  /** True while a fetch or save is in flight. */
  isLoading: boolean;
  /** ID of the workspace currently mirrored in `hooks`. Used to bust
   * stale state when switching workspaces. */
  workspaceId: string | null;
}

const initialState: HooksState = {
  hooks: [],
  knownKinds: [],
  isLoading: false,
  workspaceId: null,
};

interface GetAgentHooksResponse {
  hooks?: HookEntry[];
  knownKinds?: string[];
}

/**
 * Fetches the current hook list + known kinds for the given workspace.
 * Pixel: `GetAgentHooks(workspaceId='...')`.
 */
export const fetchAgentHooks = createAsyncThunk<
  { workspaceId: string; hooks: HookEntry[]; knownKinds: string[] },
  { workspaceId: string; runPixel: RunPixelFn }
>("hooks/fetchAgentHooks", async ({ workspaceId, runPixel }) => {
  const pixel = `GetAgentHooks(workspaceId='${workspaceId}');`;
  const response = await runPixel<GetAgentHooksResponse>(pixel);
  return {
    workspaceId,
    hooks: Array.isArray(response?.hooks) ? response.hooks : [],
    knownKinds: Array.isArray(response?.knownKinds)
      ? response.knownKinds
      : [],
  };
});

/**
 * Persists the full hook list back to the workspace. Pixel:
 * `SetAgentHooks(workspaceId='...', hooks=[...])`. Backend re-validates
 * every entry against `AgentHookRegistry` + kind-specific required fields
 * and rejects the whole call on any error.
 */
export const saveAgentHooks = createAsyncThunk<
  { workspaceId: string; hooks: HookEntry[] },
  { workspaceId: string; hooks: HookEntry[]; runPixel: RunPixelFn }
>("hooks/saveAgentHooks", async ({ workspaceId, hooks, runPixel }) => {
  // JSON-stringify each entry and join — matches the SEMOSS pixel list
  // convention used elsewhere (e.g. SetProjectDependencies).
  const hooksJson = JSON.stringify(hooks);
  const pixel = `SetAgentHooks(workspaceId='${workspaceId}', hooks=${hooksJson});`;
  await runPixel(pixel);
  return { workspaceId, hooks };
});

const hooksSlice = createSlice({
  name: "hooks",
  initialState,
  reducers: {
    clearHooks(state) {
      state.hooks = [];
      state.knownKinds = [];
      state.workspaceId = null;
    },
    setHooksLocal(state, action: PayloadAction<HookEntry[]>) {
      state.hooks = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAgentHooks.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(fetchAgentHooks.fulfilled, (state, action) => {
      state.isLoading = false;
      state.workspaceId = action.payload.workspaceId;
      state.hooks = action.payload.hooks;
      state.knownKinds = action.payload.knownKinds;
    });
    builder.addCase(fetchAgentHooks.rejected, (state) => {
      state.isLoading = false;
    });
    builder.addCase(saveAgentHooks.pending, (state) => {
      state.isLoading = true;
    });
    builder.addCase(saveAgentHooks.fulfilled, (state, action) => {
      state.isLoading = false;
      // Mirror the saved list immediately so the UI doesn't have to
      // wait for the re-fetch. fetchAgentHooks will overwrite this
      // shortly with the server's canonical version.
      state.workspaceId = action.payload.workspaceId;
      state.hooks = action.payload.hooks;
    });
    builder.addCase(saveAgentHooks.rejected, (state) => {
      state.isLoading = false;
    });
  },
});

export const { clearHooks, setHooksLocal } = hooksSlice.actions;
export default hooksSlice.reducer;
