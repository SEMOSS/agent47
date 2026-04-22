import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
    getTranscriptEventStableKey,
    type TranscriptEvent,
} from "@/types/transcript";
import { startNewRoom } from "./chatSlice";

export interface TranscriptState {
    events: TranscriptEvent[];
}

const initialState: TranscriptState = {
    events: [],
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
            const nextEvent = action.payload;
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
    },
});

export const { addTranscriptEvent, setTranscriptEvents, clearTranscript } =
    transcriptSlice.actions;
export default transcriptSlice.reducer;
