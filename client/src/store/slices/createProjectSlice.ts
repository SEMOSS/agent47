import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { callClaudeCode } from "../thunks/callClaudeCode";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

interface CreateProjectState {
  projectId: string;
  projectName: string;
}

const initialState: CreateProjectState = {
  projectId: "",
  projectName: "",
};

export const createReactProject = createAsyncThunk<
  { projectId: string },
  { projectName: string; runPixel: RunPixelFn }
>(
  "createProject/createReactProject",
  async ({ projectName, runPixel }, { dispatch }) => {
    const createProjectPixel = `CreateAppFromTemplate ( project = '${projectName}', projectTemplate ='0f8c31e4-5c48-41e3-8570-1c4fe88a6bfe');`;

    try {
      const response = await runPixel(createProjectPixel);
      console.log("CreateAppFromTemplate response:", response);
      const projectId = response.project_id;
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
  { projectName: string; runPixel: RunPixelFn }
>(
  "createProject/createProject",
  async ({ projectName, runPixel }, { dispatch }) => {
    const createProjectPixel = `CreateProject ( project = '${projectName}', portal=['true'], projectType=['CODE'] ) ;`;
    try {
      const response = await runPixel(createProjectPixel);
      console.log("CreateProject response:", response);
      const projectId = response.project_id;
      if (!projectId) {
        throw new Error("Project ID not found in response");
      }
      const saveAssetPixel = `SaveAsset ( fileName = [ "version/assets/portals/index.html" ] , content = [ "<encode><html><style>html {font-family: sans-serif; padding: 30px;}</style><h1>${projectName}</h1><p>This is placeholder text for your new Application.</p><p>You can add new files and edit this text using the Code Editor.</p></html></encode>" ] , space = [ '${projectId}' ] ) ;`;
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
        callClaudeCode({ message: claudePrompt, runPixel, projectId }),
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
  },
});

export const { setProjectName, setProjectId } = createProjectSlice.actions;
export default createProjectSlice.reducer;
