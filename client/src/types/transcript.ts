export type TranscriptHarness = "claude_code" | "github_copilot";

export type TranscriptMessageType =
    | "user"
    | "assistant"
    | "attachment"
    | "queue-operation"
    | "last-prompt";

export type TranscriptMessage = {
    type: TranscriptMessageType;
    uuid: string;
    parentUuid: string;
    timestamp: string;
    sessionId: string;
    promptId?: string;
};

export type UserPrompt = {
    kind: "user-prompt";
    promptId: string;
    text: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type ToolInvocation = {
    kind: "tool-invocation";
    toolUseId: string;
    eventId?: string;
    toolName: string;
    description?: string;
    subagentType?: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type AssistantText = {
    kind: "assistant-text";
    eventId?: string;
    text: string;
    display?: "message" | "intent";
    model?: string;
    isPartial?: boolean;
    parentToolUseId?: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type ToolStats = {
    readCount: number;
    searchCount: number;
    bashCount: number;
    editFileCount: number;
    linesAdded: number;
    linesRemoved: number;
};

export type ToolResult = {
    kind: "tool-result";
    toolUseId: string;
    eventId?: string;
    toolName?: string;
    status: string;
    isPartial?: boolean;
    durationMs: number;
    stats?: ToolStats;
    filePath?: string;
    content?: string;
    detailedContent?: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type TranscriptEvent =
    | UserPrompt
    | ToolInvocation
    | AssistantText
    | ToolResult;

export const getTranscriptEventStableKey = (
    event: TranscriptEvent,
): string | null => {
    switch (event.kind) {
        case "user-prompt":
            return event.promptId
                ? `user-prompt:${event.promptId}`
                : null;
        case "assistant-text":
            return event.eventId
                ? `assistant-text:${event.eventId}`
                : null;
        case "tool-invocation":
            return event.toolUseId
                ? `tool-invocation:${event.toolUseId}`
                : null;
        case "tool-result":
            return event.toolUseId
                ? `tool-result:${event.toolUseId}`
                : null;
        default:
            return null;
    }
};
