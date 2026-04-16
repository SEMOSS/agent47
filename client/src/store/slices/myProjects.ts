import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

interface MyProjectsState {
  projects: any[];
}

const initialState: MyProjectsState = {
  projects: [],
};

export const queryMyProjects = createAsyncThunk<
  { projects: any[] },
  { runPixel: RunPixelFn }
>("myProjects/queryMyProjects", async ({ runPixel }) => {
  const pixelString = `MyProjects ( metaKeys = [ "tag" , "domain" , "data classification" , "data restrictions" , "description" ] , metaFilters = [ { 'tag': 'CLAUDE'} ] , filterWord = [ "" ] , onlyPortals = [ true ] ) ;`;
  try {
    const response = await runPixel(pixelString);
    // console.log("MyProjects response:", response);
    return { projects: response || [] };
  } catch (error) {
    console.error("Error fetching projects:", error);
    throw error;
  }
});

const myProjectsSlice = createSlice({
  name: "myProjects",
  initialState,
  reducers: {
    setProjects(state, action: PayloadAction<any[]>) {
      state.projects = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(queryMyProjects.fulfilled, (state, action) => {
      state.projects = action.payload.projects;
    });
  },
});

export const { setProjects } = myProjectsSlice.actions;
export default myProjectsSlice.reducer;
