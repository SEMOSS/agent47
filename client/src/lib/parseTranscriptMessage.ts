import type {
    TranscriptEvent,
    TranscriptHarness,
} from "@/types/transcript";
import { parseClaudeCodeTranscriptMessage } from "./transcriptParsers/claudeCode";
import { parseGitHubCopilotTranscriptMessage } from "./transcriptParsers/githubCopilot";

export const parseTranscriptMessage = (
    raw: unknown,
    harnessType: TranscriptHarness = "claude_code",
): TranscriptEvent[] => {
    switch (harnessType) {
        case "github_copilot":
            return parseGitHubCopilotTranscriptMessage(raw);
        case "claude_code":
        default:
            return parseClaudeCodeTranscriptMessage(raw);
    }
};
