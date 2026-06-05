import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { runAgentHarness } from "../thunks/runAgentHarness";
import type { StreamingResponse } from "@/contexts/AppContext";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;
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

export interface TemplateProject {
  id: string;
  name: string;
}

interface CreateProjectState {
  projectId: string;
  projectName: string;
  templates: TemplateProject[];
  templatesLoading: boolean;
  templatesError: string | null;
}

const initialState: CreateProjectState = {
  projectId: "",
  projectName: "",
  templates: [],
  templatesLoading: false,
  templatesError: null,
};

const TEMPLATE_TAG = "TEMPLATE";

export const fetchTemplates = createAsyncThunk<
  TemplateProject[],
  { runPixel: RunPixelFn }
>("createProject/fetchTemplates", async ({ runPixel }) => {
  const pixel = `MyProjects ( metaKeys = [ "tag" ] , metaFilters = [ { 'tag': '${TEMPLATE_TAG}' } ] , filterWord = [ "" ] , limit = [ 100 ] , offset = [ 0 ] ) ;`;
  const response = await runPixel<unknown[]>(pixel);
  if (!Array.isArray(response)) return [];
  return response
    .map((row): TemplateProject | null => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const id =
        (r.project_id as string | undefined) ??
        (r.projectId as string | undefined) ??
        (r.project as string | undefined) ??
        (r.id as string | undefined) ??
        "";
      if (!id) return null;
      const name =
        (r.project_name as string | undefined) ??
        (r.projectName as string | undefined) ??
        (r.name as string | undefined) ??
        id;
      return { id, name };
    })
    .filter((t): t is TemplateProject => t !== null);
});

export const createReactProject = createAsyncThunk<
  { projectId: string },
  {
    projectName: string;
    templateId: string;
    runPixel: RunPixelFn;
    runPixelAsync: RunPixelAsyncFn;
    getPixelAsyncResult: GetPixelAsyncResultFn;
    getPixelJobStreaming: GetPixelJobStreamingFn;
  }
>(
  "createProject/createReactProject",
  async ({ projectName, templateId, runPixel }) => {
    if (!templateId) {
      throw new Error("templateId is required");
    }
    const createProjectPixel = `CreateAppFromTemplate ( project = '${projectName}', projectTemplate ='${templateId}');`;

    try {
      const response = await runPixel<{ project_id?: string }>(
        createProjectPixel,
      );
      console.log("CreateAppFromTemplate response:", response);
      const projectId = response?.project_id;
      if (!projectId) {
        throw new Error("Project ID not found in response");
      }
      const addTagPixel = `SetProjectMetadata(project=["${projectId}"], meta=[{"markdown":"","tag":["CLAUDE"]}], jsonCleanup=[true])`;
      await runPixel(addTagPixel);
      const claudeDirPixel = `NewAppAssetsDirectory(project=["${projectId}"], filePath=["/.claude"]);`;
      await runPixel(claudeDirPixel);
      return { projectId };
    } catch (error) {
      console.error("Error creating React project:", error);
      throw error;
    }
  },
);

export const createProject = createAsyncThunk<
  { projectId: string },
  {
    projectName: string;
    runPixel: RunPixelFn;
    runPixelAsync: RunPixelAsyncFn;
    getPixelAsyncResult: GetPixelAsyncResultFn;
    getPixelJobStreaming: GetPixelJobStreamingFn;
  }
>(
  "createProject/createProject",
  async (
    {
      projectName,
      runPixel,
      runPixelAsync,
      getPixelAsyncResult,
      getPixelJobStreaming,
    },
    { dispatch },
  ) => {
    const createProjectPixel = `CreateProject ( project = '${projectName}', portal=['true'], projectType=['CODE'] ) ;`;
    try {
      const response = await runPixel(createProjectPixel);
      console.log("CreateProject response:", response);
      const projectId = response.project_id;
      if (!projectId) {
        throw new Error("Project ID not found in response");
      }
      const saveAssetPixel = `SaveAsset ( fileName = [ "version/assets/portals/index.html" ] , content = [ "<html><style>html {font-family: sans-serif; padding: 30px;}</style><h1>${projectName}</h1><p>This is placeholder text for your new Application.</p><p>You can add new files and edit this text using the Code Editor.</p></html>" ] , space = [ '${projectId}' ] ) ;`;
      await runPixel(saveAssetPixel);
      const commitAssetPixel = `CommitAsset ( filePath = [ "version/assets/portals/index.html" ] , comment = [ "Hardcoded comment from the App Page editor" ] , space = [ '${projectId}' ] ) ;`;
      await runPixel(commitAssetPixel);
      const addTagPixel = `SetProjectMetadata(project=["${projectId}"], meta=[{"markdown":"","tag":["CLAUDE"]}], jsonCleanup=[true])`;
      await runPixel(addTagPixel);
      const claudeDirPixel = `NewAppAssetsDirectory(project=["${projectId}"], filePath=["/.claude"]);`;
      await runPixel(claudeDirPixel);
      const claudeMdPixel = `NewAppAssetsFile(project=["${projectId}"], filePath=["/CLAUDE.md"]);`;
      await runPixel(claudeMdPixel);
      const claudePrompt =
        "Analyze this project and create a CLAUDE.md file with project context, coding conventions, build instructions, and key architecture notes. Look at the directory structure, key config files, READMEs, and source code to understand the project.";
      void dispatch(
        runAgentHarness({
          message: claudePrompt,
          runPixel,
          runPixelAsync,
          getPixelAsyncResult,
          getPixelJobStreaming,
          projectId,
        }),
      );
      return { projectId };
    } catch (error) {
      console.error("Error creating project:", error);
      throw error;
    }
  },
);

const createProjectSlice = createSlice({
  name: "createProject",
  initialState,
  reducers: {
    setProjectName(state, action: PayloadAction<string>) {
      state.projectName = action.payload;
    },
    setProjectId(state, action: PayloadAction<string>) {
      state.projectId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(createProject.fulfilled, (state, action) => {
      state.projectId = action.payload.projectId;
    });
    builder.addCase(fetchTemplates.pending, (state) => {
      state.templatesLoading = true;
      state.templatesError = null;
    });
    builder.addCase(fetchTemplates.fulfilled, (state, action) => {
      state.templates = action.payload;
      state.templatesLoading = false;
    });
    builder.addCase(fetchTemplates.rejected, (state, action) => {
      state.templatesLoading = false;
      state.templatesError = action.error.message ?? "Failed to load templates";
    });
  },
});

export const { setProjectName, setProjectId } = createProjectSlice.actions;
export default createProjectSlice.reducer;
