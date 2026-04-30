import type {
    TranscriptEvent,
    TranscriptHarness,
} from "@/types/transcript";

type UnknownRecord = Record<string, unknown>;

export const asRecord = (value: unknown): UnknownRecord | null => {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as UnknownRecord;
};

export const readString = (
    value: unknown,
    fallback?: string,
): string | undefined => {
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    return fallback;
};

export const readBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        if (value === "true") return true;
        if (value === "false") return false;
    }
    return undefined;
};

export const readNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};

export const readEventId = (
    msg: UnknownRecord,
    fallback?: string,
): string | undefined =>
    readString(
        msg.eventId ?? msg.messageId ?? msg.uuid ?? msg.id,
        fallback,
    );

export const readToolUseId = (msg: UnknownRecord): string =>
    String(msg.toolUseId ?? msg.toolCallId ?? msg.id ?? "");

export const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

export const isInternalTool = (toolName: string | undefined): boolean =>
    toolName === "report_intent";

export const extractToolArgumentDescription = (
    value: unknown,
): string | undefined => {
    const msg = asRecord(value);
    if (!msg) {
        return readString(value);
    }

    return readString(
        msg.intentionSummary ??
            msg.description ??
            msg.prompt ??
            msg.file_path ??
            msg.filePath ??
            msg.path ??
            msg.command ??
            msg.pattern ??
            msg.glob ??
            msg.query ??
            msg.url ??
            msg.intent ??
            msg.message ??
            msg.arguments,
    );
};

export const extractToolDescription = (
    value: unknown,
): string | undefined => {
    const msg = asRecord(value);
    if (!msg) {
        return readString(value);
    }

    return readString(
        msg.intentionSummary ??
            msg.description ??
            msg.prompt ??
            msg.file_path ??
            msg.filePath ??
            msg.path ??
            msg.command ??
            msg.pattern ??
            msg.glob ??
            msg.query ??
            msg.url ??
            msg.intent ??
            extractToolArgumentDescription(msg.arguments),
    );
};

export const extractToolDetailedContent = (
    value: unknown,
): string | undefined => {
    const msg = asRecord(value);
    if (!msg) {
        return undefined;
    }

    const result = asRecord(msg.result);
    if (result) {
        return readString(result.detailedContent);
    }

    return undefined;
};

export const extractToolResultContent = (
    msg: UnknownRecord,
): string | undefined => {
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

const inferKind = (
    msg: UnknownRecord,
): TranscriptEvent["kind"] | null => {
    if ("attachmentId" in msg && "promptId" in msg) return "attachment";
    if ("durationMs" in msg) return "tool-result";
    if ("toolName" in msg) return "tool-invocation";
    if ("promptId" in msg && "text" in msg) return "user-prompt";
    if ("text" in msg) return "assistant-text";
    return null;
};

const looksLikeEvent = (msg: Record<string, unknown>): boolean => {
    if ("toolName" in msg) return true;
    if ("durationMs" in msg) return true;
    if ("attachmentId" in msg && "promptId" in msg) return true;
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

export const unwrapEnvelope = (
    raw: unknown,
): Record<string, unknown> | null => {
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
                // Preserve identity + the typed-event discriminator across
                // the unwrap; otherwise stream envelopes like
                // { stream_type, data: { type, data: {...inner} } } drop
                // `type` after the second peel, which makes
                // parseTypedCopilotEvent fall through and silently emit nothing.
                ...("event" in msg ? { event: msg.event } : {}),
                ...("uuid" in msg ? { uuid: msg.uuid } : {}),
                ...("sessionId" in msg ? { sessionId: msg.sessionId } : {}),
                ...("type" in msg ? { type: msg.type } : {}),
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
                ...("type" in msg ? { type: msg.type } : {}),
                ...payload,
            };
            continue;
        }

        break;
    }

    return msg;
};

export const parseSingleEvent = (
    msg: UnknownRecord,
    harnessType: TranscriptHarness,
): TranscriptEvent | null => {
    const explicitKind = msg.kind as string | undefined;
    const kind = explicitKind ?? inferKind(msg);

    if (!kind) return null;

    switch (kind) {
        case "attachment":
            return {
                kind: "attachment",
                attachmentId: String(msg.attachmentId ?? ""),
                promptId: String(msg.promptId ?? ""),
                fileName: String(msg.fileName ?? ""),
                mimeType: String(msg.mimeType ?? ""),
                dataUrl: readString(msg.dataUrl),
                path: readString(msg.path),
                timestamp: String(msg.timestamp ?? ""),
                harnessType,
            };

        case "user-prompt":
            return {
                kind: "user-prompt",
                promptId: String(msg.promptId ?? ""),
                text: String(msg.text ?? ""),
                timestamp: String(msg.timestamp ?? ""),
                harnessType,
            };

        case "tool-invocation":
            if (isInternalTool(readString(msg.toolName ?? msg.name))) {
                return null;
            }

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
                harnessType,
            };

        case "assistant-text":
            return {
                kind: "assistant-text",
                eventId: readEventId(msg),
                text: String(msg.text ?? ""),
                display:
                    readString(msg.display) === "intent"
                        ? "intent"
                        : "message",
                model: msg.model ? String(msg.model) : undefined,
                isPartial: readBoolean(msg.isPartial),
                parentToolUseId: readString(
                    msg.parentToolUseId ?? msg.parentToolCallId,
                ),
                timestamp: String(msg.timestamp ?? ""),
                harnessType,
            };

        case "tool-result": {
            if (isInternalTool(readString(msg.toolName))) {
                return null;
            }

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
                toolName: readString(msg.toolName),
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
                detailedContent: extractToolDetailedContent(msg),
                timestamp: String(msg.timestamp ?? ""),
                harnessType,
            };
        }

        default:
            return null;
    }
};

export const parseAggregateAssistantEvent = (
    msg: UnknownRecord,
    harnessType: TranscriptHarness,
): TranscriptEvent[] => {
    const hasTexts = Array.isArray(msg.texts) && msg.texts.length > 0;
    const hasInvocations =
        Array.isArray(msg.toolInvocations) && msg.toolInvocations.length > 0;

    if (!hasTexts && !hasInvocations) {
        return [];
    }

    const events: TranscriptEvent[] = [];
    const parentEventId = readEventId(msg);
    const parentTimestamp = readString(msg.timestamp, "");
    const parentModel = readString(msg.model);
    const parentPartial = readBoolean(msg.isPartial);
    const parentToolUseId = readString(
        msg.parentToolUseId ?? msg.parentToolCallId,
    );

    if (hasTexts) {
        for (const [index, item] of (msg.texts as unknown[]).entries()) {
            const textEvent = asRecord(item);
            if (!textEvent) {
                continue;
            }

            const parsed = parseSingleEvent(
                {
                    ...textEvent,
                    eventId:
                        readEventId(textEvent) ??
                        (parentEventId
                            ? `${parentEventId}:text:${index}`
                            : undefined),
                    model: textEvent.model ?? parentModel,
                    isPartial: textEvent.isPartial ?? parentPartial,
                    parentToolUseId:
                        textEvent.parentToolUseId ??
                        textEvent.parentToolCallId ??
                        parentToolUseId,
                    timestamp: textEvent.timestamp ?? parentTimestamp ?? "",
                },
                harnessType,
            );
            if (parsed) {
                events.push(parsed);
            }
        }
    }

    if (hasInvocations) {
        for (const invocation of msg.toolInvocations as unknown[]) {
            const toolInvocation = asRecord(invocation);
            if (!toolInvocation) {
                continue;
            }

            const parsed = parseSingleEvent(
                {
                    ...toolInvocation,
                    eventId:
                        readEventId(toolInvocation) ??
                        parentEventId ??
                        undefined,
                    timestamp:
                        toolInvocation.timestamp ?? parentTimestamp ?? "",
                },
                harnessType,
            );
            if (parsed) {
                events.push(parsed);
            }
        }
    }

    return events;
};
