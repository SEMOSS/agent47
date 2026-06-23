import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;

/**
 * A skill attached to the current workspace. Sourced from the top-level
 * `skills[]` array on `GetWorkspace`, which already resolves each
 * attached skill_id to its name/slug/type.
 */
export interface AttachedSkill {
  skill_id: string;
  slug?: string;
  name?: string;
  description?: string;
  type?: string;
}

export interface SkillState {
  skills: AttachedSkill[];
}

const initialState: SkillState = {
  skills: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const optionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Load the skills attached to a workspace. `GetWorkspace` returns a
 * top-level `skills[]` array with `{ id, name, slug, type }` already
 * resolved.
 */
export const querySkills = createAsyncThunk<
  AttachedSkill[],
  { workspaceId: string; runPixel: RunPixelFn }
>("skills/querySkills", async ({ workspaceId, runPixel }) => {
  if (!workspaceId) return [];

  const workspace = await runPixel<Record<string, unknown> | null>(
    `GetWorkspace(workspaceId='${workspaceId}');`,
  );
  const rawSkills = workspace?.skills;
  if (!Array.isArray(rawSkills)) return [];

  return rawSkills
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map<AttachedSkill | null>((item) => {
      const skillId = optionalString(item.id);
      if (!skillId) return null;
      return {
        skill_id: skillId,
        slug: optionalString(item.slug),
        name: optionalString(item.name),
        description: optionalString(item.description),
        type: optionalString(item.type),
      };
    })
    .filter((s): s is AttachedSkill => s !== null);
});

const skillsSlice = createSlice({
  name: "skills",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(querySkills.fulfilled, (state, action) => {
      state.skills = action.payload;
    });
  },
});

export default skillsSlice.reducer;
