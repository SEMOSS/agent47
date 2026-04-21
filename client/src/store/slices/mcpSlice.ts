import {
	createAsyncThunk,
	createSlice,
	type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

interface SelectedMCP {
	project_id: string;
	project_name: string;
}

export interface MCPState {
	mcps: any;
	selectedMcps: SelectedMCP[];
}

const initialState: MCPState = {
	mcps: null,
	selectedMcps: [],
};

export const callGetUserMcps = createAsyncThunk<
	{ response: any },
	{ runPixel: RunPixelFn; filterWord?: string }
>("mcp/callGetUserMcps", async ({ runPixel, filterWord }) => {
	const trimmed = filterWord?.trim() ?? "";
	const pixelString = trimmed
		? `MyEngineProject ( metaKeys = [ "tag" , "description" ] , metaFilters = [ { "tag" : [ "MCP" ] } ] , type = [ "PROJECT" , "STORAGE" , "DATABASE" , "FUNCTION" , "MODEL" ] , filterWord = "<encode>${trimmed}</encode>" , limit = [ 25 ] , offset = [ 0 ] ) ;`
		: 'MyEngineProject ( metaKeys = [ "tag" , "description" ] , metaFilters = [ { "tag" : [ "MCP" ] } ] , type = [ "PROJECT" ] , limit = [ 60 ] , offset = [ 0 ] ) ;';
	try {
		const response = await runPixel(pixelString);
		return { response };
	} catch (error) {
		console.error("Error fetching MCPs:", error);
		throw error;
	}
});

const mcpSlice = createSlice({
	name: "mcp",
	initialState,
	reducers: {
		setMcps: (state, action: PayloadAction<any>) => {
			state.mcps = action.payload;
		},
		setSelectedMcps: (state, action: PayloadAction<SelectedMCP[]>) => {
			state.selectedMcps = action.payload;
		},
		addSelectedMcp: (state, action: PayloadAction<SelectedMCP>) => {
			const exists = state.selectedMcps.some(
				(mcp) => mcp.project_id === action.payload.project_id,
			);
			if (!exists) {
				state.selectedMcps.push(action.payload);
			}
		},
		removeSelectedMcp: (state, action: PayloadAction<string>) => {
			state.selectedMcps = state.selectedMcps.filter(
				(mcp) => mcp.project_id !== action.payload,
			);
		},
	},
	extraReducers: (builder) => {
		builder.addCase(callGetUserMcps.fulfilled, (state, action) => {
			state.mcps = action.payload.response;
		});
	},
});

export const { setMcps, setSelectedMcps, addSelectedMcp, removeSelectedMcp } =
	mcpSlice.actions;
export default mcpSlice.reducer;
