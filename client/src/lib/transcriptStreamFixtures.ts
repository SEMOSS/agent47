import type { StreamingMessage } from "@/contexts/AppContext";

export const claudePixelJobStreamFixture: StreamingMessage[] = [
    {
        stream_type: "content",
        data: {
            event: "assistant",
            uuid: "048ab705-0cbc-4ad4-af32-103afa5f6489",
            sessionId: "85432046-1ce0-4b8a-805e-e53c5a2a1b13",
            data: {
                model: "aa876e7e-e78e-404d-b7db-1a44236bc2a5",
                toolInvocations: [
                    {
                        toolUseId:
                            "toolu_vrtx_01GnRRh75hk9cyxnUK95hysz",
                        toolName: "Bash",
                        description: "List top-level assets directory",
                        timestamp: "2026-04-22T17:27:50.140694+00:00",
                    },
                ],
            },
        },
    },
];

export const githubCopilotPixelJobStreamFixture: StreamingMessage[] = [
    {
        stream_type: "content",
        data: {
            event: "assistant",
            uuid: "copilot-intent-1",
            sessionId: "copilot-run-1",
            data: {
                model: "gpt-5",
                timestamp: "2026-04-22T17:28:11.500000+00:00",
                texts: [
                    {
                        eventId: "copilot-intent-1",
                        text: "Exploring codebase",
                        display: "intent",
                        model: "gpt-5",
                        isPartial: false,
                        timestamp: "2026-04-22T17:28:11.500000+00:00",
                    },
                ],
            },
        },
    },
    {
        stream_type: "tool",
        data: {
            type: "assistant.message",
            id: "copilot-message-1",
            timestamp: "2026-04-22T17:28:12.000000+00:00",
            data: {
                messageId: "copilot-message-1",
                interactionId: "copilot-run-1",
                content: "",
                toolRequests: [
                    {
                        toolCallId: "tool-call-1",
                        name: "view",
                        type: "function",
                        intentionSummary:
                            "view the file at /Users/demo/app/client/src/App.tsx.",
                        arguments: {
                            path: "/Users/demo/app/client/src/App.tsx",
                        },
                    },
                ],
            },
        },
    },
    {
        stream_type: "tool",
        data: {
            type: "tool.execution_start",
            id: "copilot-tool-1",
            timestamp: "2026-04-22T17:28:13.000000+00:00",
            data: {
                toolCallId: "tool-call-1",
                toolName: "view",
                arguments: {
                    path: "/Users/demo/app/client/src/App.tsx",
                },
            },
        },
    },
    {
        stream_type: "tool",
        data: {
            type: "tool.execution_complete",
            id: "copilot-tool-result-1",
            timestamp: "2026-04-22T17:28:14.000000+00:00",
            data: {
                toolCallId: "tool-call-1",
                success: true,
                result: {
                    content:
                        '1. import { AppShell } from "@/components/AppShell";',
                },
            },
        },
    },
    {
        stream_type: "content",
        data: {
            type: "assistant.message",
            id: "copilot-message-2",
            timestamp: "2026-04-22T17:28:15.000000+00:00",
            data: {
                messageId: "copilot-message-2",
                interactionId: "copilot-run-1",
                content: "I found the main app entry point in `src/App.tsx`.",
            },
        },
    },
];
