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
            uuid: "copilot-message-1",
            sessionId: "copilot-run-1",
            data: {
                model: "gpt-5",
                texts: [
                    {
                        eventId: "copilot-message-1",
                        text: "Searching the workspace",
                        model: "gpt-5",
                        isPartial: true,
                        timestamp: "2026-04-22T17:28:12.000000+00:00",
                    },
                ],
            },
        },
    },
    {
        stream_type: "content",
        data: {
            event: "assistant",
            uuid: "copilot-tool-1",
            sessionId: "copilot-run-1",
            data: {
                toolInvocations: [
                    {
                        toolUseId: "tool-call-1",
                        toolName: "Bash",
                        description: "Find assets directory",
                        timestamp: "2026-04-22T17:28:13.000000+00:00",
                    },
                ],
            },
        },
    },
    {
        stream_type: "content",
        data: {
            event: "tool_result",
            uuid: "tool-call-1",
            sessionId: "copilot-run-1",
            data: {
                toolUseId: "tool-call-1",
                status: "completed",
                durationMs: 0,
                content:
                    "/Users/kunalppatel9/Documents/SEMOSS/workspace/Semoss/project",
                timestamp: "2026-04-22T17:28:14.000000+00:00",
            },
        },
    },
];
