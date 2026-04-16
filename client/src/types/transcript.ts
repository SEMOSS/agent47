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
};

export type ToolInvocation = {
    kind: "tool-invocation";
    toolUseId: string;
    toolName: string;
    description?: string;
    subagentType?: string;
    timestamp: string;
};

export type AssistantText = {
    kind: "assistant-text";
    text: string;
    model?: string;
    timestamp: string;
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
    status: string;
    durationMs: number;
    stats?: ToolStats;
    filePath?: string;
    content?: string;
    timestamp: string;
};

export type TranscriptEvent =
    | UserPrompt
    | ToolInvocation
    | AssistantText
    | ToolResult;
