import {
    createAsyncThunk,
    createSlice,
    type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

export interface MCPItem {
    id: string;
    name: string;
    type: string;
    description?: string;
}

export interface MCPState {
    items: MCPItem[];
    pinnedItems: MCPItem[];
    selectedMcps: MCPItem[];
    search: string;
    offset: number;
    hasMore: boolean;
    isLoading: boolean;
    didHydrateDefaults: boolean;
    activeRequestId: string | null;
}

export const DEFAULT_SELECTED_MCP_IDS = [
    "4b4e1df8-cff6-4345-863b-5631a0e51000",
    "394404bf-02e5-44b2-bc7c-e93d9b698f58",
    "ce722163-2a8c-4667-b504-ce8732d77123",
];

const MCP_PAGE_SIZE = 20;
const MCP_META_KEYS = '[ "tag" , "description" ]';
const MCP_META_FILTERS = '[ { "tag" : [ "MCP" ] } ]';

const buildProjectList = (projectIds: string[]) =>
    projectIds.map((projectId) => `"${projectId}"`).join(" , ");

const buildBrowsePixel = (filterWord: string, offset: number) => {
    const trimmed = filterWord.trim();
    if (trimmed) {
        return `MyEngineProject ( metaKeys = ${MCP_META_KEYS} , metaFilters = ${MCP_META_FILTERS} , type = [ "PROJECT" , "STORAGE" , "DATABASE" , "FUNCTION" , "MODEL" ] , filterWord = "<encode>${trimmed}</encode>" , limit = [ ${MCP_PAGE_SIZE} ] , offset = [ ${offset} ] ) ;`;
    }

    return `MyEngineProject ( metaKeys = ${MCP_META_KEYS} , metaFilters = ${MCP_META_FILTERS} , type = [ "PROJECT" ] , limit = [ ${MCP_PAGE_SIZE} ] , offset = [ ${offset} ] ) ;`;
};

const buildPinnedProjectsPixel = (projectIds: string[]) =>
    `MyEngineProject ( metaKeys = ${MCP_META_KEYS} , metaFilters = ${MCP_META_FILTERS} , project = [ ${buildProjectList(projectIds)} ] , type = [ "PROJECT" ] , limit = [ ${MCP_PAGE_SIZE} ] , offset = [ 0 ] ) ;`;

const normalizeMcp = (mcp: Record<string, any>): MCPItem | null => {
    const id =
        mcp.project_id ??
        mcp.projectId ??
        mcp.project ??
        mcp.engine_id ??
        mcp.engineId ??
        mcp.database_id ??
        mcp.databaseId ??
        mcp.id ??
        "";

    if (!id) {
        return null;
    }

    const name =
        mcp.project_display_name ??
        mcp.projectDisplayName ??
        mcp.project_name ??
        mcp.projectName ??
        mcp.engine_display_name ??
        mcp.engineDisplayName ??
        mcp.engine_name ??
        mcp.engineName ??
        mcp.database_name ??
        mcp.databaseName ??
        mcp.name ??
        "Untitled MCP";

    const type =
        mcp.project_id || mcp.projectId || mcp.project
            ? "PROJECT"
            : String(
                    mcp.engine_type ??
                        mcp.engineType ??
                        mcp.database_type ??
                        mcp.databaseType ??
                        mcp.type ??
                        "PROJECT",
                ).toUpperCase();

    const description =
        typeof mcp.description === "string" ? mcp.description : undefined;

    return {
        id: String(id),
        name: String(name),
        type,
        description,
    };
};

const mergeUniqueMcps = (existing: MCPItem[], incoming: MCPItem[]) => {
    const mergedById = new Map<string, MCPItem>();

    for (const item of existing) {
        mergedById.set(item.id, item);
    }

    for (const item of incoming) {
        const previous = mergedById.get(item.id);
        mergedById.set(item.id, previous ? { ...previous, ...item } : item);
    }

    const orderedIds = new Set<string>();
    const orderedItems: MCPItem[] = [];

    for (const item of [...existing, ...incoming]) {
        if (orderedIds.has(item.id)) {
            continue;
        }
        orderedIds.add(item.id);
        orderedItems.push(mergedById.get(item.id) ?? item);
    }

    return orderedItems;
};

const getDefaultMatches = (items: MCPItem[]) =>
    items.filter((item) => DEFAULT_SELECTED_MCP_IDS.includes(item.id));

const initialState: MCPState = {
    items: [],
    pinnedItems: [],
    selectedMcps: [],
    search: "",
    offset: 0,
    hasMore: true,
    isLoading: false,
    didHydrateDefaults: false,
    activeRequestId: null,
};

export const callGetUserMcps = createAsyncThunk<
    {
        items: MCPItem[];
        append: boolean;
        nextOffset: number;
        filterWord: string;
    },
    { runPixel: RunPixelFn; filterWord?: string; offset?: number; append?: boolean }
>("mcp/callGetUserMcps", async ({ runPixel, filterWord, offset, append }) => {
    const requestedOffset = offset ?? 0;
    const trimmed = filterWord?.trim() ?? "";
    const pixelString = buildBrowsePixel(trimmed, requestedOffset);

    try {
        const response = await runPixel<unknown[]>(pixelString);
        const items = (response ?? [])
            .map((item) => normalizeMcp((item ?? {}) as Record<string, any>))
            .filter((item): item is MCPItem => item !== null);

        return {
            items,
            append: append === true,
            nextOffset: requestedOffset + items.length,
            filterWord: trimmed,
        };
    } catch (error) {
        console.error("Error fetching MCPs:", error);
        throw error;
    }
});

export const hydrateDefaultMcps = createAsyncThunk<
    { items: MCPItem[] },
    { runPixel: RunPixelFn }
>("mcp/hydrateDefaultMcps", async ({ runPixel }) => {
    if (DEFAULT_SELECTED_MCP_IDS.length === 0) {
        return { items: [] };
    }

    try {
        const response = await runPixel<unknown[]>(
            buildPinnedProjectsPixel(DEFAULT_SELECTED_MCP_IDS),
        );
        const items = (response ?? [])
            .map((item) => normalizeMcp((item ?? {}) as Record<string, any>))
            .filter((item): item is MCPItem => item !== null);

        return { items };
    } catch (error) {
        console.error("Error hydrating default MCPs:", error);
        throw error;
    }
});

const mcpSlice = createSlice({
    name: "mcp",
    initialState,
    reducers: {
        setMcpSearch: (state, action: PayloadAction<string>) => {
            state.search = action.payload;
            state.items = [];
            state.offset = 0;
            state.hasMore = true;
            state.isLoading = false;
            state.activeRequestId = null;
        },
        resetMcpPickerState: (state) => {
            state.items = [];
            state.search = "";
            state.offset = 0;
            state.hasMore = true;
            state.isLoading = false;
            state.activeRequestId = null;
        },
        setSelectedMcps: (state, action: PayloadAction<MCPItem[]>) => {
            state.selectedMcps = mergeUniqueMcps([], action.payload);
        },
        addSelectedMcp: (state, action: PayloadAction<MCPItem>) => {
            state.selectedMcps = mergeUniqueMcps(state.selectedMcps, [
                action.payload,
            ]);
        },
        removeSelectedMcp: (state, action: PayloadAction<string>) => {
            state.selectedMcps = state.selectedMcps.filter(
                (mcp) => mcp.id !== action.payload,
            );
        },
    },
    extraReducers: (builder) => {
        builder.addCase(callGetUserMcps.pending, (state, action) => {
            if ((action.meta.arg.filterWord?.trim() ?? "") !== state.search.trim()) {
                return;
            }

            state.isLoading = true;
            state.activeRequestId = action.meta.requestId;
        });
        builder.addCase(callGetUserMcps.fulfilled, (state, action) => {
            if (
                action.payload.filterWord !== state.search.trim() ||
                state.activeRequestId !== action.meta.requestId
            ) {
                return;
            }

            state.isLoading = false;
            state.activeRequestId = null;
            state.items = action.payload.append
                ? mergeUniqueMcps(state.items, action.payload.items)
                : action.payload.items;
            state.offset = action.payload.nextOffset;
            state.hasMore = action.payload.items.length === MCP_PAGE_SIZE;

            const defaultMatches = getDefaultMatches(action.payload.items);
            if (defaultMatches.length > 0) {
                state.pinnedItems = mergeUniqueMcps(
                    state.pinnedItems,
                    defaultMatches,
                );
                state.selectedMcps = mergeUniqueMcps(
                    state.selectedMcps,
                    defaultMatches,
                );
            }
        });
        builder.addCase(callGetUserMcps.rejected, (state, action) => {
            if (
                (action.meta.arg.filterWord?.trim() ?? "") !== state.search.trim() ||
                state.activeRequestId !== action.meta.requestId
            ) {
                return;
            }

            state.isLoading = false;
            state.activeRequestId = null;
        });
        builder.addCase(hydrateDefaultMcps.fulfilled, (state, action) => {
            state.pinnedItems = mergeUniqueMcps(
                state.pinnedItems,
                action.payload.items,
            );
            state.selectedMcps = mergeUniqueMcps(
                state.selectedMcps,
                getDefaultMatches(action.payload.items),
            );
            state.didHydrateDefaults = true;
        });
        builder.addCase(hydrateDefaultMcps.rejected, (state) => {
            state.didHydrateDefaults = true;
        });
    },
});

export const {
    setMcpSearch,
    resetMcpPickerState,
    setSelectedMcps,
    addSelectedMcp,
    removeSelectedMcp,
} = mcpSlice.actions;
export default mcpSlice.reducer;
