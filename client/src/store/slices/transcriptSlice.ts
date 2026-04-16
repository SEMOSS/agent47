import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { TranscriptEvent } from "@/types/transcript";
import { startNewRoom } from "./chatSlice";

export interface TranscriptState {
    events: TranscriptEvent[];
}

const initialState: TranscriptState = {
    events: [],
};

const transcriptSlice = createSlice({
    name: "transcript",
    initialState,
    reducers: {
        addTranscriptEvent(state, action: PayloadAction<TranscriptEvent>) {
            state.events.push(action.payload);
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
