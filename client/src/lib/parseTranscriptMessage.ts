import type { TranscriptEvent } from "@/types/transcript";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as UnknownRecord;
};

const readString = (
    value: unknown,
    fallback?: string,
): string | undefined => {
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    return fallback;
};

const readBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        if (value === "true") return true;
        if (value === "false") return false;
    }
    return undefined;
};

const readNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

const readEventId = (
    msg: UnknownRecord,
    fallback?: string,
): string | undefined =>
    readString(
        msg.eventId ?? msg.messageId ?? msg.uuid ?? msg.id,
        fallback,
    );

const readToolUseId = (msg: UnknownRecord): string =>
    String(msg.toolUseId ?? msg.toolCallId ?? msg.id ?? "");

const extractToolDescription = (value: unknown): string | undefined => {
    const msg = asRecord(value);
    if (!msg) {
        return readString(value);
    }

    return readString(
        msg.description ??
            msg.prompt ??
            msg.file_path ??
            msg.filePath ??
            msg.command ??
            msg.arguments,
    );
};

const extractToolResultContent = (msg: UnknownRecord): string | undefined => {
    const directContent = readString(msg.content);
    if (directContent) {
        return directContent;
    }

    const result = asRecord(msg.result);
    if (result) {
        return readString(result.content ?? result.detailedContent);
    }

    const error = asRecord(msg.error);
    if (error) {
        return readString(error.message);
    }

    const partialOutput = readString(msg.partialOutput);
    if (partialOutput) {
        return partialOutput;
    }

    const progressMessage = readString(msg.progressMessage);
    if (progressMessage) {
        return progressMessage;
    }

    return undefined;
};

/**
 * Detect the transcript event type by inspecting which fields are present.
 *
 * The Java backend serializes plain records without a discriminant field,
 * so we use structural typing to figure out what we're looking at:
 *
 *   - has `toolName`               → ToolInvocation
 *   - has `durationMs`             → ToolResult
 *   - has `promptId` and `text`    → UserPrompt
 *   - has `text` (and no above)    → AssistantText
 */
const inferKind = (
    msg: UnknownRecord,
): TranscriptEvent["kind"] | null => {
    if ("toolName" in msg) return "tool-invocation";
    if ("durationMs" in msg) return "tool-result";
    if ("promptId" in msg && "text" in msg) return "user-prompt";
    if ("text" in msg) return "assistant-text";
    return null;
};

/**
 * Returns true if `msg` already looks like a recognizable transcript event
 * (or an "assistant" aggregate with texts/toolInvocations). Used to know when
 * to stop peeling envelope layers.
 */
const looksLikeEvent = (msg: Record<string, unknown>): boolean => {
    if ("toolName" in msg) return true;
    if ("durationMs" in msg) return true;
    if ("promptId" in msg) return true;
    if ("text" in msg && typeof msg.text === "string") return true;
    if ("messageId" in msg && typeof msg.messageId === "string") return true;
    if ("toolCallId" in msg && typeof msg.toolCallId === "string") return true;
    if (Array.isArray(msg.texts) && (msg.texts as unknown[]).length > 0) {
        return true;
    }
    if (
        Array.isArray(msg.toolInvocations) &&
        (msg.toolInvocations as unknown[]).length > 0
    ) {
        return true;
    }
    return false;
};

/**
 * Unwraps the raw message envelope, returning the inner payload.
 *
 * The websocket wraps events in a single `data` layer:
 *   { type: "claude_code", data: { toolName: "Read", ... } }
 *
 * The async pixel streamer wraps them in two layers:
 *   { stream_type, data: { event, uuid, sessionId, data: { model, toolInvocations } } }
 *
 * We peel `data` / `payload` layers until we reach something that looks like
 * an actual event.
 */
const unwrapEnvelope = (raw: unknown): Record<string, unknown> | null => {
    const initial = asRecord(raw);
    if (!initial) {
        return null;
    }

    let msg = initial;

    for (let depth = 0; depth < 4; depth += 1) {
        if (looksLikeEvent(msg)) break;

        const data = asRecord(msg.data);
        if (data) {
            msg = {
                ...("event" in msg ? { event: msg.event } : {}),
                ...("uuid" in msg ? { uuid: msg.uuid } : {}),
                ...("sessionId" in msg ? { sessionId: msg.sessionId } : {}),
                ...data,
            };
            continue;
        }

        const payload = asRecord(msg.payload);
        if (payload) {
            msg = {
                ...("event" in msg ? { event: msg.event } : {}),
                ...("uuid" in msg ? { uuid: msg.uuid } : {}),
                ...("sessionId" in msg ? { sessionId: msg.sessionId } : {}),
                ...payload,
            };
            continue;
        }

        break;
    }

    return msg;
};

/**
 * Parse a single flat message object into a TranscriptEvent.
 */
const parseSingleEvent = (
    msg: UnknownRecord,
): TranscriptEvent | null => {
    // If the backend includes a `kind` discriminant, use it directly
    const explicitKind = msg.kind as string | undefined;
    const kind = explicitKind ?? inferKind(msg);

    if (!kind) return null;

    switch (kind) {
        case "user-prompt":
            return {
                kind: "user-prompt",
                promptId: String(msg.promptId ?? ""),
                text: String(msg.text ?? ""),
                timestamp: String(msg.timestamp ?? ""),
            };

        case "tool-invocation":
            return {
                kind: "tool-invocation",
                eventId: readEventId(msg),
                toolUseId: readToolUseId(msg),
                toolName: String(msg.toolName ?? msg.name ?? ""),
                description: extractToolDescription(
                    msg.description ?? msg.arguments,
                ),
                subagentType: msg.subagentType
                    ? String(msg.subagentType)
                    : undefined,
                timestamp: String(msg.timestamp ?? ""),
            };

        case "assistant-text":
            return {
                kind: "assistant-text",
                eventId: readEventId(msg),
                text: String(msg.text ?? ""),
                model: msg.model ? String(msg.model) : undefined,
                isPartial: readBoolean(msg.isPartial),
                parentToolUseId: readString(
                    msg.parentToolUseId ?? msg.parentToolCallId,
                ),
                timestamp: String(msg.timestamp ?? ""),
            };

        case "tool-result": {
            const stats = msg.stats as Record<string, unknown> | undefined;
            const success = readBoolean(msg.success);
            const status = readString(msg.status)
                ? String(msg.status)
                : success === false
                  ? "error"
                  : "completed";
            return {
                kind: "tool-result",
                eventId: readEventId(msg),
                toolUseId: readToolUseId(msg),
                status,
                isPartial: readBoolean(msg.isPartial),
                durationMs: readNumber(msg.durationMs),
                stats: stats
                    ? {
                          readCount: readNumber(stats.readCount),
                          searchCount: readNumber(stats.searchCount),
                          bashCount: readNumber(stats.bashCount),
                          editFileCount: readNumber(stats.editFileCount),
                          linesAdded: readNumber(stats.linesAdded),
                          linesRemoved: readNumber(stats.linesRemoved),
                      }
                    : undefined,
                filePath: readString(msg.filePath),
                content: extractToolResultContent(msg),
                timestamp: String(msg.timestamp ?? ""),
            };
        }

        default:
            return null;
    }
};

/**
 * Attempts to parse a raw websocket message into one or more TranscriptEvents.
 *
 * The backend sends JSON objects whose type is inferred from field
 * presence. If the message doesn't match any known shape, returns
 * an empty array so the caller can silently skip it.
 *
 * Handles envelope wrappers (`data` / `payload`) and the
 * `toolInvocations` array pattern used by "assistant" events.
 */
export const parseTranscriptMessage = (
    raw: unknown,
): TranscriptEvent[] => {
    const msg = unwrapEnvelope(raw);
    if (!msg) return [];

    // "assistant" events may carry `texts` and/or `toolInvocations` arrays.
    // Extract each entry as its own event.
    const hasTexts = Array.isArray(msg.texts) && msg.texts.length > 0;
    const hasInvocations =
        Array.isArray(msg.toolInvocations) && msg.toolInvocations.length > 0;

    if (hasTexts || hasInvocations) {
        const events: TranscriptEvent[] = [];
        const parentEventId = readEventId(msg);
        const parentTimestamp = readString(msg.timestamp, "");
        const parentModel = readString(msg.model);
        const parentPartial = readBoolean(msg.isPartial);
        const parentToolUseId = readString(
            msg.parentToolUseId ?? msg.parentToolCallId,
        );

        if (hasTexts) {
            for (const [index, item] of (
                msg.texts as Record<string, unknown>[]
            ).entries()) {
                const t = asRecord(item);
                if (t) {
                    const parsed = parseSingleEvent({
                        ...t,
                        eventId:
                            readEventId(t) ??
                            (parentEventId
                                ? `${parentEventId}:text:${index}`
                                : undefined),
                        model: t.model ?? parentModel,
                        isPartial: t.isPartial ?? parentPartial,
                        parentToolUseId:
                            t.parentToolUseId ??
                            t.parentToolCallId ??
                            parentToolUseId,
                        timestamp: t.timestamp ?? parentTimestamp ?? "",
                    });
                    if (parsed) events.push(parsed);
                }
            }
        }

        if (hasInvocations) {
            for (const invItem of msg.toolInvocations as Record<
                string,
                unknown
            >[]) {
                const inv = asRecord(invItem);
                if (inv) {
                    const parsed = parseSingleEvent({
                        ...inv,
                        eventId:
                            readEventId(inv) ?? parentEventId ?? undefined,
                        timestamp: inv.timestamp ?? parentTimestamp ?? "",
                    });
                    if (parsed) events.push(parsed);
                }
            }
        }

        return events;
    }

    // Standard single-event message
    const event = parseSingleEvent(msg);
    return event ? [event] : [];
};
