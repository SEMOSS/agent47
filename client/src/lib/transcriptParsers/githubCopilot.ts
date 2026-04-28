import type { TranscriptEvent } from "@/types/transcript";
import {
    asRecord,
    extractToolArgumentDescription,
    extractToolDescription,
    parseAggregateAssistantEvent,
    parseSingleEvent,
    readBoolean,
    readEventId,
    readString,
    unwrapEnvelope,
} from "./shared";

const parseAssistantMessageEvent = (
    msg: Record<string, unknown>,
): TranscriptEvent[] => {
    const message = asRecord(msg.data) ?? msg;
    const messageId =
        readString(message.messageId) ?? readEventId(message);
    const timestamp = readString(msg.timestamp ?? message.timestamp, "") ?? "";
    const interactionId = readString(message.interactionId);
    const assistantEventId = interactionId ?? messageId;
    const messageStatus = readString(message.status ?? message.state, "")
        ?.toLowerCase()
        .trim();
    const isPartial =
        readBoolean(message.isPartial) ??
        (messageStatus
            ? !["complete", "completed", "done", "success"].includes(
                  messageStatus,
              )
            : undefined);
    const toolRequests = Array.isArray(message.toolRequests)
        ? message.toolRequests
        : [];
    const events: TranscriptEvent[] = [];

    for (const [index, item] of toolRequests.entries()) {
        const request = asRecord(item);
        if (!request) {
            continue;
        }

        const toolName = readString(request.name) ?? "";
        if (toolName === "report_intent") {
            const intent = extractToolArgumentDescription(request.arguments);
            if (!intent) {
                continue;
            }

            const parsedIntent = parseSingleEvent(
                {
                    kind: "assistant-text",
                    eventId:
                        readEventId(request) ??
                        (assistantEventId
                            ? `${assistantEventId}:intent:${index}`
                            : undefined),
                    text: intent,
                    display: "intent",
                    model: message.model,
                    isPartial,
                    timestamp,
                },
                "github_copilot_py",
            );

            if (parsedIntent) {
                events.push(parsedIntent);
            }
            continue;
        }

        const parsedToolInvocation = parseSingleEvent(
            {
                kind: "tool-invocation",
                eventId:
                    readEventId(request) ??
                    (messageId ? `${messageId}:tool:${index}` : undefined),
                toolCallId:
                    request.toolCallId ??
                    request.toolUseId ??
                    request.id,
                toolName,
                description:
                    extractToolDescription(request) ??
                    extractToolArgumentDescription(request.arguments),
                timestamp,
            },
            "github_copilot_py",
        );

        if (parsedToolInvocation) {
            events.push(parsedToolInvocation);
        }
    }

    if (typeof message.content === "string" && message.content.length > 0) {
        const parsedMessage = parseSingleEvent(
            {
                kind: "assistant-text",
                eventId: assistantEventId,
                text: message.content,
                model: message.model,
                isPartial,
                timestamp,
            },
            "github_copilot_py",
        );

        if (parsedMessage) {
            events.push(parsedMessage);
        }
    }

    return events;
};

const parseToolExecutionStartEvent = (
    msg: Record<string, unknown>,
): TranscriptEvent[] => {
    const data = asRecord(msg.data);
    if (!data) {
        return [];
    }

    const parsed = parseSingleEvent(
        {
            kind: "tool-invocation",
            eventId: readEventId(msg),
            toolCallId: data.toolCallId,
            toolName: readString(data.toolName),
            description: extractToolDescription(data.arguments),
            timestamp: String(msg.timestamp ?? ""),
        },
        "github_copilot_py",
    );

    return parsed ? [parsed] : [];
};

const parseToolExecutionCompleteEvent = (
    msg: Record<string, unknown>,
): TranscriptEvent[] => {
    const data = asRecord(msg.data);
    if (!data) {
        return [];
    }

    const result = asRecord(data.result);
    const parsed = parseSingleEvent(
        {
            kind: "tool-result",
            eventId: readEventId(msg),
            toolCallId: data.toolCallId,
            toolName: readString(data.toolName),
            status: readString(data.status),
            success: data.success,
            durationMs: data.durationMs ?? result?.durationMs,
            content: result?.content,
            result,
            timestamp: String(msg.timestamp ?? ""),
        },
        "github_copilot_py",
    );

    return parsed ? [parsed] : [];
};

const parseTypedCopilotEvent = (
    msg: Record<string, unknown>,
): TranscriptEvent[] | null => {
    const type = readString(msg.type);

    if (type === "assistant.message") {
        return parseAssistantMessageEvent(msg);
    }

    if (type === "tool.execution_start") {
        return parseToolExecutionStartEvent(msg);
    }

    if (type === "tool.execution_complete") {
        return parseToolExecutionCompleteEvent(msg);
    }

    return null;
};

export const parseGitHubCopilotTranscriptMessage = (
    raw: unknown,
): TranscriptEvent[] => {
    const directMessage = asRecord(raw);
    if (directMessage) {
        const directEvents = parseTypedCopilotEvent(directMessage);
        if (directEvents) {
            return directEvents;
        }
    }

    const msg = unwrapEnvelope(raw);
    if (!msg) {
        return [];
    }

    const typedEvents = parseTypedCopilotEvent(msg);
    if (typedEvents) {
        return typedEvents;
    }

    const aggregateEvents = parseAggregateAssistantEvent(
        msg,
        "github_copilot_py",
    );
    if (aggregateEvents.length > 0) {
        return aggregateEvents;
    }

    const event = parseSingleEvent(msg, "github_copilot_py");
    return event ? [event] : [];
};
