import type { TranscriptEvent } from "@/types/transcript";

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
    msg: Record<string, unknown>,
): TranscriptEvent["kind"] | null => {
    if ("toolName" in msg) return "tool-invocation";
    if ("durationMs" in msg) return "tool-result";
    if ("promptId" in msg && "text" in msg) return "user-prompt";
    if ("text" in msg) return "assistant-text";
    return null;
};

/**
 * Unwraps the raw websocket message envelope, returning the inner payload.
 */
const unwrapEnvelope = (raw: unknown): Record<string, unknown> | null => {
    if (raw == null || typeof raw !== "object") {
        return null;
    }

    let msg = raw as Record<string, unknown>;

    // If the backend or streamer wraps the event in an envelope, unwrap it.
    // e.g. { type: "claude_code", data: { toolName: "Read", ... } }
    if (msg.data && typeof msg.data === "object" && !Array.isArray(msg.data)) {
        msg = msg.data as Record<string, unknown>;
    } else if (
        msg.payload &&
        typeof msg.payload === "object" &&
        !Array.isArray(msg.payload)
    ) {
        msg = msg.payload as Record<string, unknown>;
    }

    return msg;
};

/**
 * Parse a single flat message object into a TranscriptEvent.
 */
const parseSingleEvent = (
    msg: Record<string, unknown>,
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
                toolUseId: String(msg.toolUseId ?? ""),
                toolName: String(msg.toolName ?? ""),
                description: msg.description
                    ? String(msg.description)
                    : undefined,
                subagentType: msg.subagentType
                    ? String(msg.subagentType)
                    : undefined,
                timestamp: String(msg.timestamp ?? ""),
            };

        case "assistant-text":
            return {
                kind: "assistant-text",
                text: String(msg.text ?? ""),
                model: msg.model ? String(msg.model) : undefined,
                timestamp: String(msg.timestamp ?? ""),
            };

        case "tool-result": {
            const stats = msg.stats as Record<string, unknown> | undefined;
            return {
                kind: "tool-result",
                toolUseId: String(msg.toolUseId ?? ""),
                status: String(msg.status ?? ""),
                durationMs: Number(msg.durationMs ?? 0),
                stats: stats
                    ? {
                          readCount: Number(stats.readCount ?? 0),
                          searchCount: Number(stats.searchCount ?? 0),
                          bashCount: Number(stats.bashCount ?? 0),
                          editFileCount: Number(stats.editFileCount ?? 0),
                          linesAdded: Number(stats.linesAdded ?? 0),
                          linesRemoved: Number(stats.linesRemoved ?? 0),
                      }
                    : undefined,
                filePath: msg.filePath ? String(msg.filePath) : undefined,
                content: msg.content ? String(msg.content) : undefined,
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

        if (hasTexts) {
            for (const t of msg.texts as Record<string, unknown>[]) {
                if (t && typeof t === "object") {
                    const parsed = parseSingleEvent(t);
                    if (parsed) events.push(parsed);
                }
            }
        }

        if (hasInvocations) {
            for (const inv of msg.toolInvocations as Record<
                string,
                unknown
            >[]) {
                if (inv && typeof inv === "object") {
                    const parsed = parseSingleEvent(inv);
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
