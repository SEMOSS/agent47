import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
    getTranscriptEventStableKey,
    type TranscriptEvent,
    type ToolInvocation,
    type ToolResult,
} from "@/types/transcript";
import { setActiveProject, startNewRoom } from "./chatSlice";
import { createProject, createReactProject } from "./createProjectSlice";

export interface TranscriptState {
    events: TranscriptEvent[];
}

const initialState: TranscriptState = {
    events: [],
};

const findToolInvocation = (
    events: TranscriptEvent[],
    toolUseId: string,
): ToolInvocation | undefined =>
    events.find(
        (event): event is ToolInvocation =>
            event.kind === "tool-invocation" &&
            event.toolUseId === toolUseId,
    );

const enrichToolResult = (
    events: TranscriptEvent[],
    event: ToolResult,
): ToolResult => {
    if (event.toolName) {
        return event;
    }

    const invocation = findToolInvocation(events, event.toolUseId);
    if (!invocation) {
        return event;
    }

    return {
        ...event,
        toolName: invocation.toolName,
    };
};

const mergeTranscriptEvent = (
    existing: TranscriptEvent,
    incoming: TranscriptEvent,
): TranscriptEvent => {
    const timestamp = existing.timestamp || incoming.timestamp;

    switch (incoming.kind) {
        case "assistant-text":
            return {
                ...existing,
                ...incoming,
                timestamp,
            };
        case "tool-invocation":
            return {
                ...existing,
                ...incoming,
                timestamp,
            };
        case "tool-result":
            return {
                ...existing,
                ...incoming,
                timestamp,
            };
        case "user-prompt":
            return {
                ...existing,
                ...incoming,
                timestamp,
            };
        default:
            return incoming;
    }
};

const transcriptSlice = createSlice({
    name: "transcript",
    initialState,
    reducers: {
        addTranscriptEvent(state, action: PayloadAction<TranscriptEvent>) {
            const nextEvent =
                action.payload.kind === "tool-result"
                    ? enrichToolResult(state.events, action.payload)
                    : action.payload;
            const stableKey = getTranscriptEventStableKey(nextEvent);

            if (!stableKey) {
                state.events.push(nextEvent);
                return;
            }

            const existingIndex = state.events.findIndex(
                (event) => getTranscriptEventStableKey(event) === stableKey,
            );

            if (existingIndex === -1) {
                state.events.push(nextEvent);
                return;
            }

            state.events[existingIndex] = mergeTranscriptEvent(
                state.events[existingIndex],
                nextEvent,
            );
        },
        setTranscriptEvents(
            state,
            action: PayloadAction<TranscriptEvent[]>,
        ) {
            state.events = action.payload;
        },
        clearTranscript(state) {
            state.events = [];
        },
    },
    extraReducers: (builder) => {
        // Reset transcript when the user explicitly starts a new chat room.
        // Per-message sends do NOT clear it, so prior events persist across
        // consecutive turns in the same room.
        builder.addCase(startNewRoom, (state) => {
            state.events = [];
        });
        builder.addCase(setActiveProject, (state) => {
            state.events = [];
        });
        builder.addCase(createProject.fulfilled, (state) => {
            state.events = [];
        });
        builder.addCase(createReactProject.fulfilled, (state) => {
            state.events = [];
        });
    },
});

export const { addTranscriptEvent, setTranscriptEvents, clearTranscript } =
    transcriptSlice.actions;
export default transcriptSlice.reducer;
