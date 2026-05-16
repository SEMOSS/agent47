import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

export interface Commit {
    commitId: string;
    author: { userId: string; userEmail: string };
    date: string;
    commitMessage: string;
    tags: string[];
}

export interface CommitFile {
    fileName: string;
    changeType: string;
    newPath: string;
}

export interface FileDiff extends CommitFile {
    diff: string;
    isBinary: boolean;
    isTruncated: boolean;
}

interface GitState {
    commits: Commit[];
    selectedCommitId: string | null;
    commitFiles: CommitFile[];
    selectedFilePath: string | null;
    fileDiff: FileDiff | null;
    isLoadingCommits: boolean;
    isLoadingFiles: boolean;
    isLoadingDiff: boolean;
    error: string | null;
    offset: number;
    hasMore: boolean;
}

const initialState: GitState = {
    commits: [],
    selectedCommitId: null,
    commitFiles: [],
    selectedFilePath: null,
    fileDiff: null,
    isLoadingCommits: false,
    isLoadingFiles: false,
    isLoadingDiff: false,
    error: null,
    offset: 0,
    hasMore: true,
};

const DEFAULT_LIMIT = 20;

export const fetchCommitHistory = createAsyncThunk<
    { commits: Commit[]; offset: number; hasMore: boolean; append: boolean },
    {
        projectId: string;
        runPixel: RunPixelFn;
        limit?: number;
        offset?: number;
        append?: boolean;
    },
    { rejectValue: string }
>(
    "git/fetchCommitHistory",
    async (
        { projectId, runPixel, limit = DEFAULT_LIMIT, offset = 0, append = false },
        { rejectWithValue },
    ) => {
        try {
            const pixel = `ProjectCommitDetails(project=["${projectId}"], limit=["${limit}"], offset=["${offset}"]);`;
            const commits = await runPixel<Commit[]>(pixel);
            return {
                commits: commits ?? [],
                offset: offset + (commits?.length ?? 0),
                hasMore: (commits?.length ?? 0) === limit,
                append,
            };
        } catch (e) {
            return rejectWithValue(
                e instanceof Error ? e.message : "Failed to fetch commit history",
            );
        }
    },
);

export const fetchCommitDiff = createAsyncThunk<
    { commitId: string; files: CommitFile[] },
    { projectId: string; commitId: string; runPixel: RunPixelFn },
    { rejectValue: string }
>(
    "git/fetchCommitDiff",
    async ({ projectId, commitId, runPixel }, { rejectWithValue }) => {
        try {
            const pixel = `ProjectCommitDiff(project=["${projectId}"], commitId=["${commitId}"]);`;
            const files = await runPixel<CommitFile[]>(pixel);
            return { commitId, files: files ?? [] };
        } catch (e) {
            return rejectWithValue(
                e instanceof Error ? e.message : "Failed to fetch commit diff",
            );
        }
    },
);

export const fetchFileDiff = createAsyncThunk<
    { filePath: string; diff: FileDiff },
    { projectId: string; commitId: string; filePath: string; runPixel: RunPixelFn },
    { rejectValue: string }
>(
    "git/fetchFileDiff",
    async ({ projectId, commitId, filePath, runPixel }, { rejectWithValue }) => {
        try {
            const pixel = `ProjectCommitDiff(project=["${projectId}"], commitId=["${commitId}"], filePath=["${filePath}"]);`;
            const results = await runPixel<FileDiff[]>(pixel);
            const diff = results?.[0];
            if (!diff) throw new Error("No diff returned");
            return { filePath, diff };
        } catch (e) {
            return rejectWithValue(
                e instanceof Error ? e.message : "Failed to fetch file diff",
            );
        }
    },
);

const gitSlice = createSlice({
    name: "git",
    initialState,
    reducers: {
        selectCommit(state, action: PayloadAction<string | null>) {
            state.selectedCommitId = action.payload;
            state.commitFiles = [];
            state.selectedFilePath = null;
            state.fileDiff = null;
        },
        selectFile(state, action: PayloadAction<string | null>) {
            state.selectedFilePath = action.payload;
            state.fileDiff = null;
        },
        clearGitState() {
            return initialState;
        },
        clearError(state) {
            state.error = null;
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchCommitHistory.pending, (state) => {
                state.isLoadingCommits = true;
                state.error = null;
            })
            .addCase(fetchCommitHistory.fulfilled, (state, action) => {
                state.isLoadingCommits = false;
                state.commits = action.payload.append
                    ? [...state.commits, ...action.payload.commits]
                    : action.payload.commits;
                state.offset = action.payload.offset;
                state.hasMore = action.payload.hasMore;
            })
            .addCase(fetchCommitHistory.rejected, (state, action) => {
                state.isLoadingCommits = false;
                state.error = action.payload ?? action.error.message ?? "Unknown error";
            })
            .addCase(fetchCommitDiff.pending, (state) => {
                state.isLoadingFiles = true;
                state.error = null;
            })
            .addCase(fetchCommitDiff.fulfilled, (state, action) => {
                state.isLoadingFiles = false;
                state.selectedCommitId = action.payload.commitId;
                state.commitFiles = action.payload.files;
                state.selectedFilePath = null;
                state.fileDiff = null;
            })
            .addCase(fetchCommitDiff.rejected, (state, action) => {
                state.isLoadingFiles = false;
                state.error = action.payload ?? action.error.message ?? "Unknown error";
            })
            .addCase(fetchFileDiff.pending, (state) => {
                state.isLoadingDiff = true;
                state.error = null;
            })
            .addCase(fetchFileDiff.fulfilled, (state, action) => {
                state.isLoadingDiff = false;
                state.selectedFilePath = action.payload.filePath;
                state.fileDiff = action.payload.diff;
            })
            .addCase(fetchFileDiff.rejected, (state, action) => {
                state.isLoadingDiff = false;
                state.error = action.payload ?? action.error.message ?? "Unknown error";
            });
    },
});

export const { selectCommit, selectFile, clearGitState, clearError } = gitSlice.actions;
export default gitSlice.reducer;
