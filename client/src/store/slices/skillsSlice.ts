import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";

type RunPixelFn = <T = unknown>(pixelString: string) => Promise<T>;
const sanitizePixelArg = (value: string) => value.replace(/'/g, '"');

interface Skill {
  name: string;
  content: string;
}

interface ClaudeMd {
  name: string;
  content: string;
}

export interface SkillState {
  skills: Skill[];
  claudeMd: ClaudeMd | null;
}

const initialState: SkillState = {
  skills: [],
  claudeMd: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isClaudeMdKey = (key: string) => key.trim().toLowerCase() === "claude.md";

const parseJsonIfString = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const toSkillArray = (value: unknown): Skill[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Skill => isRecord(item))
    .map((item) => ({
      name: String(item.name ?? ""),
      content: String(item.content ?? ""),
    }))
    .filter((item) => item.name.length > 0 || item.content.length > 0);
};

const toClaudeMd = (value: unknown): ClaudeMd | null => {
  if (!isRecord(value)) {
    return null;
  }

  const name = String(value.name ?? "");
  const content = String(value.content ?? "");

  if (!name && !content) {
    return null;
  }

  return { name, content };
};

const toNamedSkillMapPayload = (
  value: unknown,
): { skills: Skill[]; claudeMd: ClaudeMd | null } | null => {
  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(
    ([, entryValue]) => typeof entryValue === "string",
  );
  if (entries.length === 0) {
    return null;
  }

  const skills: Skill[] = [];
  let claudeMd: ClaudeMd | null = null;

  for (const [name, contentValue] of entries) {
    const content = String(contentValue ?? "");
    if (!content) {
      continue;
    }

    if (isClaudeMdKey(name)) {
      claudeMd = { name, content };
      continue;
    }

    skills.push({ name, content });
  }

  if (skills.length === 0 && !claudeMd) {
    return null;
  }

  return { skills, claudeMd };
};

const normalizeSkillsPayload = (
  response: unknown,
): { skills: Skill[]; claudeMd: ClaudeMd | null } => {
  const direct = parseJsonIfString(response);

  if (Array.isArray(direct)) {
    return { skills: toSkillArray(direct), claudeMd: null };
  }

  if (!isRecord(direct)) {
    return { skills: [], claudeMd: null };
  }

  const namedMapPayload = toNamedSkillMapPayload(direct);
  if (namedMapPayload) {
    return namedMapPayload;
  }

  const rootSkills = toSkillArray(direct.skills);
  const rootClaudeMd = toClaudeMd(direct.claudeMd);
  if (rootSkills.length > 0 || rootClaudeMd) {
    return { skills: rootSkills, claudeMd: rootClaudeMd };
  }

  const nestedCandidates = [
    direct.response,
    direct.output,
    direct.data,
    direct.result,
    direct.payload,
  ];

  for (const candidate of nestedCandidates) {
    const parsedCandidate = parseJsonIfString(candidate);

    if (Array.isArray(parsedCandidate)) {
      const nestedSkills = toSkillArray(parsedCandidate);
      if (nestedSkills.length > 0) {
        return { skills: nestedSkills, claudeMd: null };
      }
      continue;
    }

    if (!isRecord(parsedCandidate)) {
      continue;
    }

    const namedNestedMapPayload = toNamedSkillMapPayload(parsedCandidate);
    if (namedNestedMapPayload) {
      return namedNestedMapPayload;
    }

    const nestedSkills = toSkillArray(parsedCandidate.skills);
    const nestedClaudeMd = toClaudeMd(parsedCandidate.claudeMd);
    if (nestedSkills.length > 0 || nestedClaudeMd) {
      return { skills: nestedSkills, claudeMd: nestedClaudeMd };
    }
  }

  return { skills: [], claudeMd: null };
};

export const querySkills = createAsyncThunk<
  { skills: Skill[]; claudeMd: ClaudeMd | null },
  { projectId: string; runPixel: RunPixelFn }
>("skills/querySkills", async ({ projectId, runPixel }) => {
  const pixelString = `ClaudeCodeGetSkills( project='${projectId}' ) ;`;
  try {
    const response = await runPixel<unknown>(pixelString);
    console.log("querySkills response:", response);
    return normalizeSkillsPayload(response);
  } catch (error) {
    console.error("Error fetching skills:", error);
    throw error;
  }
});

export const updateSkill = createAsyncThunk<
  { result: boolean },
  {
    projectId: string;
    skillName: string;
    skillContent: string;
    runPixel: RunPixelFn;
  }
>(
  "skills/updateSkill",
  async ({ projectId, skillName, skillContent, runPixel }) => {
    const safeProjectId = sanitizePixelArg(projectId);
    const safeSkillName = sanitizePixelArg(skillName);
    const safeSkillContent = sanitizePixelArg(skillContent);
    const pixelString = `ClaudeCodeUpdateSkill( project='${safeProjectId}', skillName='${safeSkillName}', skillContent='${safeSkillContent}' ) ;`;
    try {
      const response = await runPixel<unknown>(pixelString);
      console.log("updateSkill response:", response);
      if (isRecord(response) && "result" in response) {
        return { result: Boolean(response.result) };
      }
      return { result: Boolean(response) };
    } catch (error) {
      console.error("Error updating skill:", error);
      throw error;
    }
  },
);

export const deleteSkill = createAsyncThunk<
  { result: boolean },
  { projectId: string; skillName: string; runPixel: RunPixelFn }
>("skills/deleteSkill", async ({ projectId, skillName, runPixel }) => {
  const safeProjectId = sanitizePixelArg(projectId);
  const safeSkillName = sanitizePixelArg(skillName);
  const pixelString = `ClaudeCodeDeleteSkill( project='${safeProjectId}', skillName='${safeSkillName}' ) ;`;
  try {
    const response = await runPixel<unknown>(pixelString);
    console.log("deleteSkill response:", response);
    if (isRecord(response) && "result" in response) {
      return { result: Boolean(response.result) };
    }
    return { result: Boolean(response) };
  } catch (error) {
    console.error("Error deleting skill:", error);
    throw error;
  }
});

export const createSkill = createAsyncThunk<
  { result: boolean },
  {
    projectId: string;
    skillName: string;
    skillContent: string;
    runPixel: RunPixelFn;
  }
>(
  "skills/createSkill",
  async ({ projectId, skillName, skillContent, runPixel }) => {
    const safeProjectId = sanitizePixelArg(projectId);
    const safeSkillName = sanitizePixelArg(skillName);
    const safeSkillContent = sanitizePixelArg(skillContent);
    const pixelString = `ClaudeCodeCreateSkill( project='${safeProjectId}', skillName='${safeSkillName}', skillContent='${safeSkillContent}' ) ;`;
    try {
      const response = await runPixel<unknown>(pixelString);
      console.log("createSkill response:", response);
      if (isRecord(response) && "result" in response) {
        return { result: Boolean(response.result) };
      }
      return { result: Boolean(response) };
    } catch (error) {
      console.error("Error creating skill:", error);
      throw error;
    }
  },
);

const skillsSlice = createSlice({
  name: "skills",
  initialState,
  reducers: {
    setSkills(state, action: PayloadAction<Skill[]>) {
      state.skills = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(querySkills.fulfilled, (state, action) => {
      state.skills = action.payload.skills;
      state.claudeMd = action.payload.claudeMd;
    });
    builder.addCase(updateSkill.fulfilled, (state, action) => {
      if (!action.payload.result) {
        return;
      }

      const { skillName, skillContent } = action.meta.arg;
      const normalizedSkillName = skillName.trim().toLowerCase();
      const existingSkill = state.skills.find(
        (skill) => skill.name.trim().toLowerCase() === normalizedSkillName,
      );
      if (existingSkill) {
        existingSkill.content = skillContent;
        return;
      }

      const claudeMdName = state.claudeMd?.name?.trim().toLowerCase() ?? "";
      if (
        normalizedSkillName === "claude.md" ||
        (state.claudeMd && claudeMdName === normalizedSkillName)
      ) {
        state.claudeMd = {
          name: state.claudeMd?.name || skillName,
          content: skillContent,
        };
        return;
      }

      state.skills.push({ name: skillName, content: skillContent });
    });
    builder.addCase(deleteSkill.fulfilled, (state, action) => {
      if (!action.payload.result) {
        return;
      }
      const { skillName } = action.meta.arg;
      const normalized = skillName.trim().toLowerCase();
      state.skills = state.skills.filter(
        (skill) => skill.name.trim().toLowerCase() !== normalized,
      );
    });
    builder.addCase(createSkill.fulfilled, (state, action) => {
      if (!action.payload.result) {
        return;
      }
      const { skillName, skillContent } = action.meta.arg;
      state.skills.push({ name: skillName, content: skillContent });
    });
  },
});

export const { setSkills } = skillsSlice.actions;
export default skillsSlice.reducer;
