import type { TranscriptEvent } from "@/types/transcript";
import {
    parseAggregateAssistantEvent,
    parseSingleEvent,
    unwrapEnvelope,
} from "./shared";

export const parseClaudeCodeTranscriptMessage = (
    raw: unknown,
): TranscriptEvent[] => {
    const msg = unwrapEnvelope(raw);
    if (!msg) {
        return [];
    }

    const aggregateEvents = parseAggregateAssistantEvent(
        msg,
        "claude_code",
    );
    if (aggregateEvents.length > 0) {
        return aggregateEvents;
    }

    const event = parseSingleEvent(msg, "claude_code");
    return event ? [event] : [];
};
