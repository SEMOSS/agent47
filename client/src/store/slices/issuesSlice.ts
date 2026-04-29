import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import {
  limitIssueOccurrences,
  normalizePreviewIssueTransport,
  type PreviewIssueCapability,
  type PreviewIssueContext,
  type PreviewIssueRecord,
  type PreviewIssueTransport,
} from "@/lib/previewIssues";
import { setActiveProject } from "./chatSlice";
import { createProject, createReactProject } from "./createProjectSlice";

export interface IssuesState {
  previewSessionId: string;
  capability: PreviewIssueCapability;
  records: PreviewIssueRecord[];
}

const defaultCapability = (): PreviewIssueCapability => ({
  status: "idle",
  message: "Open and test the preview to capture issues.",
});

const createInitialState = (): IssuesState => ({
  previewSessionId: uuidv4(),
  capability: defaultCapability(),
  records: [],
});

const initialState = createInitialState();

const upsertIssueRecord = (
  existing: PreviewIssueRecord,
  incoming: PreviewIssueRecord,
) => {
  existing.lastSeenAt = incoming.lastSeenAt;
  existing.count += 1;
  existing.roomId = incoming.roomId;
  existing.projectId = incoming.projectId;
  existing.previewSessionId = incoming.previewSessionId;
  existing.reviewed = false;
  existing.message = existing.message || incoming.message;
  existing.source = existing.source || incoming.source;
  existing.stack = existing.stack || incoming.stack;
  existing.request = incoming.request ?? existing.request;
  existing.response = incoming.response ?? existing.response;
  existing.occurrences = limitIssueOccurrences([
    ...incoming.occurrences,
    ...existing.occurrences,
  ]);
};

const issuesSlice = createSlice({
  name: "issues",
  initialState,
  reducers: {
    capturePreviewIssue: {
      reducer(state, action: PayloadAction<PreviewIssueRecord>) {
        const existing = state.records.find(
          (record) =>
            record.signature === action.payload.signature &&
            record.previewSessionId === action.payload.previewSessionId,
        );

        if (existing) {
          upsertIssueRecord(existing, action.payload);
          state.records.sort(
            (left, right) =>
              Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt),
          );
          return;
        }

        state.records.unshift(action.payload);
      },
      prepare(payload: {
        transport: PreviewIssueTransport;
        context: PreviewIssueContext;
      }) {
        return {
          payload: normalizePreviewIssueTransport(
            payload.transport,
            payload.context,
          ),
        };
      },
    },
    markAllIssuesSeen(state) {
      for (const record of state.records) {
        record.seen = true;
      }
    },
    markIssueReviewed(
      state,
      action: PayloadAction<{ id: string; reviewed?: boolean }>,
    ) {
      const target = state.records.find(
        (record) => record.id === action.payload.id,
      );
      if (!target) {
        return;
      }

      target.reviewed = action.payload.reviewed ?? true;
      target.seen = true;
    },
    deleteIssue(state, action: PayloadAction<{ id: string }>) {
      state.records = state.records.filter(
        (record) => record.id !== action.payload.id,
      );
    },
    markIssuesSent(
      state,
      action: PayloadAction<{ ids: string[]; roomId: string }>,
    ) {
      const sentAt = new Date().toISOString();
      const targetIds = new Set(action.payload.ids);
      for (const record of state.records) {
        if (!targetIds.has(record.id)) {
          continue;
        }

        record.lastSentAt = sentAt;
        record.roomId = action.payload.roomId;
        record.seen = true;
      }
    },
    setPreviewIssueCapability(
      state,
      action: PayloadAction<PreviewIssueCapability>,
    ) {
      state.capability = action.payload;
    },
    clearIssues(state) {
      state.records = [];
      state.capability = defaultCapability();
      state.previewSessionId = uuidv4();
    },
  },
  extraReducers: (builder) => {
    const resetIssues = (state: IssuesState) => {
      state.records = [];
      state.capability = defaultCapability();
      state.previewSessionId = uuidv4();
    };

    builder.addCase(setActiveProject, resetIssues);
    builder.addCase(createProject.fulfilled, resetIssues);
    builder.addCase(createReactProject.fulfilled, resetIssues);
  },
});

export const {
  capturePreviewIssue,
  markAllIssuesSeen,
  markIssueReviewed,
  deleteIssue,
  markIssuesSent,
  setPreviewIssueCapability,
  clearIssues,
} = issuesSlice.actions;

export const selectIssues = (state: { issues: IssuesState }) =>
  state.issues.records;

export const selectUnseenIssuesCount = (state: { issues: IssuesState }) =>
  state.issues.records.filter((record) => !record.seen).length;

export default issuesSlice.reducer;
