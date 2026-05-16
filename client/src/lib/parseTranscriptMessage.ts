import type {
    TranscriptEvent,
    TranscriptHarness,
} from "@/types/transcript";
import { parseClaudeCodeTranscriptMessage } from "./transcriptParsers/claudeCode";
import { parseGitHubCopilotTranscriptMessage } from "./transcriptParsers/githubCopilot";
import {
    asRecord,
    parseAggregateAssistantEvent,
    parseSingleEvent,
    readString,
    unwrapEnvelope,
} from "./transcriptParsers/shared";

const normalizeSemossStreamMessage = (
    raw: unknown,
): Record<string, unknown> | null => {
    const msg = asRecord(raw);
    if (!msg) {
        return null;
    }

    const streamType = readString(msg.stream_type);
    const data = asRecord(msg.data);
    if (!streamType || !data) {
        return null;
    }

    if (streamType === "content" || streamType === "thinking") {
        if (typeof data.kind === "string") {
            return data;
        }

        const text = readString(data.text ?? data.content ?? data.thinking);
        if (!text) {
            return data;
        }

        return {
            ...data,
            kind: "assistant-text",
            eventId:
                data.eventId ??
                data.uuid ??
                data.id ??
                `semoss-stream-${streamType}`,
            text,
            display: streamType === "thinking" ? "intent" : undefined,
            isPartial: data.isPartial ?? true,
            timestamp: data.timestamp ?? new Date().toISOString(),
        };
    }

    return data;
};

const parseSemossTranscriptMessage = (raw: unknown): TranscriptEvent[] => {
    const msg = normalizeSemossStreamMessage(raw) ?? unwrapEnvelope(raw);
    if (!msg) {
        return [];
    }

    const aggregateEvents = parseAggregateAssistantEvent(msg, "semoss");
    if (aggregateEvents.length > 0) {
        return aggregateEvents;
    }

    const event = parseSingleEvent(msg, "semoss");
    return event ? [event] : [];
};

export const parseTranscriptMessage = (
    raw: unknown,
    harnessType: TranscriptHarness = "claude_code",
): TranscriptEvent[] => {
    switch (harnessType) {
        case "github_copilot_py":
            return parseGitHubCopilotTranscriptMessage(raw);
        case "semoss":
            return parseSemossTranscriptMessage(raw);
        case "claude_code":
        default:
            return parseClaudeCodeTranscriptMessage(raw);
    }
};
