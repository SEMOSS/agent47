import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { type JavaIssue, parseCompileErrorOutput } from "@/lib/javaIssues";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

export interface JavaIssuesState {
  items: JavaIssue[];
  loading: boolean;
  /** ms-epoch of the most recent successful fetch, or 0 if never. */
  lastFetchedAt: number;
}

const initialState: JavaIssuesState = {
  items: [],
  loading: false,
  lastFetchedAt: 0,
};

/**
 * Fetches `classes/compileerror.out` for the given project and parses it.
 * Missing file (no Java in project) resolves to an empty issues list rather
 * than rejecting.
 */
export const fetchJavaIssues = createAsyncThunk<
  JavaIssue[],
  { projectId: string; runPixel: RunPixelFn }
>("javaIssues/fetch", async ({ projectId, runPixel }) => {
  if (!projectId) return [];
  const pixel = `GetAppAssets(project='${projectId}', filePath='/classes/compileerror.out');`;
  try {
    const raw = await runPixel<string>(pixel);
    return parseCompileErrorOutput(typeof raw === "string" ? raw : null);
  } catch (error) {
    // The reactor throws `IllegalArgumentException` when the file doesn't
    // exist — that just means the project has no compiled Java. Treat as
    // "no issues" rather than surfacing an error.
    console.debug("fetchJavaIssues: no compile output", error);
    return [];
  }
});

const javaIssuesSlice = createSlice({
  name: "javaIssues",
  initialState,
  reducers: {
    clearJavaIssues(state) {
      state.items = [];
      state.lastFetchedAt = 0;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchJavaIssues.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(fetchJavaIssues.fulfilled, (state, action) => {
      state.items = action.payload;
      state.loading = false;
      state.lastFetchedAt = Date.now();
    });
    builder.addCase(fetchJavaIssues.rejected, (state) => {
      state.loading = false;
    });
  },
});

export const { clearJavaIssues } = javaIssuesSlice.actions;
export default javaIssuesSlice.reducer;
