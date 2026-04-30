import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

export type EngineCategory = "MODEL" | "DATABASE" | "STORAGE" | "VECTOR";

export const ENGINE_CATEGORIES: EngineCategory[] = [
  "MODEL",
  "DATABASE",
  "STORAGE",
  "VECTOR",
];

export interface EngineItem {
  id: string;
  name: string;
  subtype: string;
  type: EngineCategory;
}

interface BrowseState {
  items: EngineItem[];
  search: string;
  isLoading: boolean;
}

export interface EnginesState {
  selectedEngines: Record<EngineCategory, EngineItem[]>;
  browse: Record<EngineCategory, BrowseState>;
}

const ENGINE_FETCH_LIMIT = 100;

const emptyBrowse = (): BrowseState => ({
  items: [],
  search: "",
  isLoading: false,
});

const initialState: EnginesState = {
  selectedEngines: {
    MODEL: [],
    DATABASE: [],
    STORAGE: [],
    VECTOR: [],
  },
  browse: {
    MODEL: emptyBrowse(),
    DATABASE: emptyBrowse(),
    STORAGE: emptyBrowse(),
    VECTOR: emptyBrowse(),
  },
};

const buildMyEnginesPixel = (type: EngineCategory, search: string): string => {
  const trimmed = search.trim();
  if (trimmed) {
    return `MyEngines(filterWord=["<encode>${trimmed}</encode>"], engineTypes=["${type}"], limit=[${ENGINE_FETCH_LIMIT}], offset=[0]);`;
  }
  return `MyEngines(engineTypes=["${type}"], limit=[${ENGINE_FETCH_LIMIT}], offset=[0]);`;
};

const normalizeEngine = (
  raw: Record<string, any>,
  fallbackType: EngineCategory,
): EngineItem | null => {
  const id = raw.engine_id ?? raw.engineId ?? raw.database_id ?? raw.app_id;
  if (!id) return null;

  const name =
    raw.engine_display_name ??
    raw.engineDisplayName ??
    raw.engine_name ??
    raw.engineName ??
    raw.app_display_name ??
    raw.app_name ??
    String(id);

  const type = String(
    raw.engine_type ?? raw.engineType ?? raw.app_type ?? fallbackType,
  ).toUpperCase() as EngineCategory;

  const subtype = String(
    raw.engine_subtype ?? raw.engineSubtype ?? raw.app_subtype ?? "",
  ).toUpperCase();

  return {
    id: String(id),
    name: String(name),
    subtype,
    type,
  };
};

const dedupeById = (items: EngineItem[]): EngineItem[] => {
  const seen = new Set<string>();
  const out: EngineItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
};

export const fetchEnginesByType = createAsyncThunk<
  { type: EngineCategory; items: EngineItem[]; filterWord: string },
  { type: EngineCategory; runPixel: RunPixelFn; filterWord?: string }
>("engines/fetchByType", async ({ type, runPixel, filterWord }) => {
  const search = filterWord?.trim() ?? "";
  const pixel = buildMyEnginesPixel(type, search);
  const response = await runPixel<unknown[]>(pixel);
  const items = dedupeById(
    (response ?? [])
      .map((row) => normalizeEngine((row ?? {}) as Record<string, any>, type))
      .filter((item): item is EngineItem => item !== null && item.type === type),
  );
  return { type, items, filterWord: search };
});

const enginesSlice = createSlice({
  name: "engines",
  initialState,
  reducers: {
    addSelectedEngine(
      state,
      action: PayloadAction<{ type: EngineCategory; engine: EngineItem }>,
    ) {
      const { type, engine } = action.payload;
      const list = state.selectedEngines[type];
      if (!list.some((e) => e.id === engine.id)) {
        list.push(engine);
      }
    },
    removeSelectedEngine(
      state,
      action: PayloadAction<{ type: EngineCategory; engineId: string }>,
    ) {
      const { type, engineId } = action.payload;
      state.selectedEngines[type] = state.selectedEngines[type].filter(
        (e) => e.id !== engineId,
      );
    },
    setEngineSearch(
      state,
      action: PayloadAction<{ type: EngineCategory; search: string }>,
    ) {
      const { type, search } = action.payload;
      state.browse[type].search = search;
    },
    resetBrowse(state, action: PayloadAction<EngineCategory>) {
      state.browse[action.payload] = emptyBrowse();
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchEnginesByType.pending, (state, action) => {
      state.browse[action.meta.arg.type].isLoading = true;
    });
    builder.addCase(fetchEnginesByType.fulfilled, (state, action) => {
      const { type, items, filterWord } = action.payload;
      const browse = state.browse[type];
      if (browse.search.trim() !== filterWord) {
        return;
      }
      browse.items = items;
      browse.isLoading = false;
    });
    builder.addCase(fetchEnginesByType.rejected, (state, action) => {
      state.browse[action.meta.arg.type].isLoading = false;
    });
  },
});

export const {
  addSelectedEngine,
  removeSelectedEngine,
  setEngineSearch,
  resetBrowse,
} = enginesSlice.actions;

export default enginesSlice.reducer;
