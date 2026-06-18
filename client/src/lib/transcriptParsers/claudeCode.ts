import type { TranscriptEvent } from "@/types/transcript";
import {
    asRecord,
    parseAggregateAssistantEvent,
    parseSingleEvent,
    readString,
    unwrapEnvelope,
} from "./shared";

// Extended-thinking deltas arrive wrapped in a `stream_type: "thinking"`
// envelope, but unwrapEnvelope strips stream_type while peeling the wrappers.
// Re-tag the resulting assistant text as reasoning ("intent") so it renders as
// a thinking block instead of a normal reply.
const markThinking = (
    events: TranscriptEvent[],
    isThinking: boolean,
): TranscriptEvent[] =>
    isThinking
        ? events.map((event) =>
              event.kind === "assistant-text"
                  ? { ...event, display: "intent" }
                  : event,
          )
        : events;

export const parseClaudeCodeTranscriptMessage = (
    raw: unknown,
): TranscriptEvent[] => {
    const isThinking =
        readString(asRecord(raw)?.stream_type) === "thinking";

    const msg = unwrapEnvelope(raw);
    if (!msg) {
        return [];
    }

    const aggregateEvents = parseAggregateAssistantEvent(
        msg,
        "claude_code",
    );
    if (aggregateEvents.length > 0) {
        return markThinking(aggregateEvents, isThinking);
    }

    const event = parseSingleEvent(msg, "claude_code");
    return markThinking(event ? [event] : [], isThinking);
};
