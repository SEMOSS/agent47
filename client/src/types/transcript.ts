export type TranscriptHarness =
    | "claude_code"
    | "github_copilot_py"
    | "semoss";

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

export type TranscriptReference = {
    path: string;
    label?: string;
    kind?: "file" | "directory" | "url";
    startLine?: number;
    endLine?: number;
};

export type TranscriptEventMeta = {
    turnId?: string;
    references?: TranscriptReference[];
    command?: string;
    displayName?: string;
    startedAt?: string;
    completedAt?: string;
};

export type UserPrompt = TranscriptEventMeta & {
    kind: "user-prompt";
    promptId: string;
    text: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type ToolInvocation = TranscriptEventMeta & {
    kind: "tool-invocation";
    toolUseId: string;
    eventId?: string;
    toolName: string;
    status?: "streaming" | "complete";
    title?: string;
    description?: string;
    arguments?: Record<string, unknown>;
    subagentType?: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type AssistantText = TranscriptEventMeta & {
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

export type ToolResult = TranscriptEventMeta & {
    kind: "tool-result";
    toolUseId: string;
    eventId?: string;
    toolName?: string;
    title?: string;
    status: string;
    isPartial?: boolean;
    durationMs: number;
    toolParameterValues?: Record<string, unknown>;
    stats?: ToolStats;
    filePath?: string;
    content?: string;
    detailedContent?: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type ApprovalRequested = TranscriptEventMeta & {
    kind: "approval-requested";
    approvalId: string;
    title?: string;
    description?: string;
    reason?: string;
    action?: string;
    status?: "pending" | "approved" | "rejected";
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type ApprovalResolved = TranscriptEventMeta & {
    kind: "approval-resolved";
    approvalId: string;
    status: "approved" | "rejected";
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type CheckpointCreated = TranscriptEventMeta & {
    kind: "checkpoint-created";
    checkpointId: string;
    title?: string;
    description?: string;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type MaxTurnsReached = TranscriptEventMeta & {
    kind: "max-turns-reached";
    uuid: string;
    sessionId?: string;
    maxTurns: number;
    turnCount: number;
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type AgentResult = TranscriptEventMeta & {
    kind: "agent-result";
    uuid: string;
    sessionId?: string;
    subtype?: string;
    isError?: boolean;
    numTurns?: number;
    stopReason?: string;
    totalCostUsd?: number;
    durationMs?: number;
    errors?: string[];
    timestamp: string;
    harnessType?: TranscriptHarness;
};

export type TranscriptEvent =
    | UserPrompt
    | ToolInvocation
    | AssistantText
    | ToolResult
    | ApprovalRequested
    | ApprovalResolved
    | CheckpointCreated
    | MaxTurnsReached
    | AgentResult;

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
        case "approval-requested":
            return event.approvalId
                ? `approval-requested:${event.approvalId}`
                : null;
        case "approval-resolved":
            return event.approvalId
                ? `approval-resolved:${event.approvalId}`
                : null;
        case "checkpoint-created":
            return event.checkpointId
                ? `checkpoint-created:${event.checkpointId}`
                : null;
        case "max-turns-reached":
            return event.uuid
                ? `max-turns-reached:${event.uuid}`
                : null;
        case "agent-result":
            return event.uuid
                ? `agent-result:${event.uuid}`
                : null;
        default:
            return null;
    }
};
