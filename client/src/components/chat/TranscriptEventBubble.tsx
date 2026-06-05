import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import type {
    AgentResult,
    AssistantText,
    MaxTurnsReached,
    TranscriptHarness,
    ToolInvocation,
    ToolResult,
    ToolStats,
    TranscriptEvent,
    UserPrompt,
} from "@/types/transcript";
import {
    Bot,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CircleDot,
    FileCode2,
    FileSearch,
    Loader2,
    OctagonX,
    Pencil,
    Sparkles,
    Terminal,
    Wrench,
    XCircle,
} from "lucide-react";
import { useState } from "react";

const formatTimestamp = (timestamp: string) => {
    if (!timestamp) {
        return timestamp;
    }

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
        return timestamp;
    }

    return parsed.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
    });
};

const shortenPath = (filePath: string, maxParts = 3): string => {
    const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length <= maxParts) return filePath;
    return `…/${parts.slice(-maxParts).join("/")}`;
};

const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
};

const formatLongDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const TOOL_ICONS: Record<string, typeof Wrench> = {
    read: FileSearch,
    view: FileSearch,
    grep: FileSearch,
    glob: FileSearch,
    bash: Terminal,
    agent: Bot,
    edit: Pencil,
    "nodebuildermcp-buildandpublishapp": FileCode2,
};

const TOOL_LABELS: Record<string, string> = {
    bash: "Bash",
    edit: "Edit",
    glob: "Glob",
    grep: "Grep",
    read: "Read",
    view: "View",
    "nodebuildermcp-buildandpublishapp": "Build and Publish",
};

const TOOL_ENGINE_PREFIX_RE =
    /^a?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_+/i;

const stripToolEnginePrefix = (toolName: string) =>
    toolName.trim().replace(TOOL_ENGINE_PREFIX_RE, "");

const toTitleCase = (value: string) =>
    stripToolEnginePrefix(value)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

const getToolDisplayName = (toolName: string) => {
    const normalized = stripToolEnginePrefix(toolName);
    if (!normalized) {
        return "Tool";
    }

    return TOOL_LABELS[normalized.toLowerCase()] ?? toTitleCase(normalized);
};

const getToolLookupKey = (toolName: string) =>
    stripToolEnginePrefix(toolName).replace(/[\s_-]+/g, "").toLowerCase();

const getToolIcon = (toolName: string) => {
    const rawKey = toolName.trim().toLowerCase();
    const lookupKey = getToolLookupKey(toolName);
    return TOOL_ICONS[rawKey] ?? TOOL_ICONS[lookupKey] ?? Wrench;
};

const isReportToUserTool = (toolName?: string, title?: string) => {
    const key = getToolLookupKey(toolName ?? title ?? "");
    return key === "reporttouser" || key === "reportprogress";
};

const getToolArgumentString = (
    args: Record<string, unknown> | undefined,
    key: string,
) => {
    const value = args?.[key];
    return typeof value === "string" ? value.trim() : "";
};

const LARGE_TEXT_ARG_KEYS = new Set([
    "content",
    "new_string",
    "old_string",
    "script",
    "text",
]);

const IMPORTANT_ARG_KEYS = [
    "file_path",
    "filePath",
    "path",
    "command",
    "query",
    "pattern",
    "glob",
    "offset",
    "limit",
    "content",
    "old_string",
    "new_string",
    "script",
];

const truncateMiddle = (value: string, maxLength: number) => {
    if (value.length <= maxLength) return value;
    const headLength = Math.ceil((maxLength - 1) * 0.62);
    const tailLength = Math.floor((maxLength - 1) * 0.38);
    return `${value.slice(0, headLength)}…${value.slice(-tailLength)}`;
};

const formatLargeTextSummary = (value: string) => {
    const lineCount = value.split(/\r\n|\r|\n/).length;
    const bytes = new Blob([value]).size;
    const size =
        bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
    return `<${size}${lineCount > 1 ? `, ${lineCount} lines` : ""}>`;
};

const formatToolArgValue = (key: string, value: unknown) => {
    if (typeof value === "string") {
        if (LARGE_TEXT_ARG_KEYS.has(key) && value.length > 80) {
            return formatLargeTextSummary(value);
        }
        return truncateMiddle(value.replace(/\s+/g, " "), 90);
    }

    const rendered = JSON.stringify(value);
    return rendered ? truncateMiddle(rendered, 90) : String(value);
};

const formatToolArgs = (args?: Record<string, unknown>) => {
    if (!args) return "";

    const presentEntries = Object.entries(args).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
    );
    const orderedEntries = [
        ...IMPORTANT_ARG_KEYS.flatMap((key) =>
            presentEntries.filter(([entryKey]) => entryKey === key),
        ),
        ...presentEntries.filter(
            ([key]) => !IMPORTANT_ARG_KEYS.includes(key),
        ),
    ];
    const entries = orderedEntries.slice(0, 4);
    if (entries.length === 0) return "";

    const extraCount = orderedEntries.length - entries.length;
    const summary = entries
        .map(([key, value]) => `${key}=${formatToolArgValue(key, value)}`)
        .join(", ");

    return `${summary}${extraCount > 0 ? `, +${extraCount} more` : ""}`;
};

const formatToolOutputPreview = (value: string, maxLength = 160) =>
    truncateMiddle(
        value
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\s+/g, " ")
            .trim(),
        maxLength,
    );

const buildStatsSummary = (stats: ToolStats): string => {
    const parts: string[] = [];
    if (stats.readCount > 0) parts.push(`${stats.readCount} reads`);
    if (stats.searchCount > 0) parts.push(`${stats.searchCount} searches`);
    if (stats.bashCount > 0) parts.push(`${stats.bashCount} commands`);
    if (stats.editFileCount > 0) parts.push(`${stats.editFileCount} edits`);
    if (stats.linesAdded > 0 || stats.linesRemoved > 0) {
        parts.push(`+${stats.linesAdded} / -${stats.linesRemoved} lines`);
    }
    return parts.join(" \u00b7 ");
};

const getHarnessLabel = (harnessType?: TranscriptHarness) => {
    switch (harnessType) {
        case "github_copilot_py":
            return "GitHub Copilot";
        case "semoss":
            return "SEMOSS";
        case "claude_code":
            return "Claude Code";
        default:
            return "Agent";
    }
};

const ToolInvocationBubble = ({ event }: { event: ToolInvocation }) => {
    if (isReportToUserTool(event.toolName, event.title)) {
        const message =
            getToolArgumentString(event.arguments, "message") ||
            formatToolArgs(event.arguments) ||
            "Working on the next step.";

        return (
            <div className="flex flex-col gap-1 items-start">
                <div className="flex items-start gap-2 max-w-[75%] rounded-xl border border-blue-200/80 dark:border-blue-400/20 bg-blue-50/80 dark:bg-blue-950/25 px-3 py-2 text-xs text-blue-900/80 dark:text-blue-100/80">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500 dark:text-blue-300" />
                    <div className="min-w-0 flex-1">
                        <span className="font-medium break-words">
                            {message}
                        </span>
                    </div>
                    <span className="shrink-0 text-[10px] text-blue-700/50 dark:text-blue-200/45">
                        {formatTimestamp(event.timestamp)}
                    </span>
                </div>
            </div>
        );
    }

    const Icon = getToolIcon(event.toolName);
    const displayName = event.title ?? getToolDisplayName(event.toolName);
    const label = event.subagentType
        ? `${displayName} (${event.subagentType})`
        : displayName;
    const argsSummary = formatToolArgs(event.arguments);

    return (
        <div className="flex flex-col gap-1 items-start">
            <div className="flex items-start gap-2 max-w-[75%] rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/80 dark:bg-zinc-800/40 px-3 py-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500 dark:text-blue-400" />
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium text-foreground/80 break-words">
                            {label}
                        </span>
                        {argsSummary && (
                            <span className="break-words text-muted-foreground">
                                {argsSummary}
                            </span>
                        )}
                    </div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">
                    {formatTimestamp(event.timestamp)}
                </span>
            </div>
        </div>
    );
};

const ToolResultBubble = ({ event }: { event: ToolResult }) => {
    const [expanded, setExpanded] = useState(false);

    if (isReportToUserTool(event.toolName, event.title)) {
        return null;
    }

    const isSuccess =
        event.status === "completed" || event.status === "success";
    const isError = event.status === "error" || event.status === "failed";
    const isRunning =
        event.isPartial ||
        event.status === "running" ||
        event.status === "in_progress" ||
        event.status === "progress";
    const StatusIcon = isError
        ? XCircle
        : isSuccess
          ? CheckCircle2
          : isRunning
            ? Loader2
            : CircleDot;
    const statusColor = isError
        ? "text-red-500"
        : isSuccess
          ? "text-emerald-500"
          : isRunning
            ? "text-blue-500"
            : "text-amber-500";

    const statsSummary = event.stats ? buildStatsSummary(event.stats) : "";
    const previewContent = event.content ?? event.detailedContent;
    const expandedContent = event.detailedContent ?? event.content;
    const hasContent = !!previewContent;
    const ExpandIcon = expanded ? ChevronDown : ChevronRight;
    const toolLabel = event.toolName
        ? `${event.title ?? getToolDisplayName(event.toolName)} Result`
        : "Tool Result";

    return (
        <div className="flex flex-col gap-1 items-start">
            <div className="flex flex-col max-w-[75%] rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/80 dark:bg-zinc-800/40 px-3 py-2 text-xs">
                <button
                    type="button"
                    className="flex items-center gap-2 w-full text-left"
                    onClick={() => hasContent && setExpanded(!expanded)}
                    disabled={!hasContent}
                >
                    {hasContent ? (
                        <ExpandIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    ) : (
                        <StatusIcon
                            className={`h-3.5 w-3.5 shrink-0 ${statusColor} ${isRunning ? "animate-spin" : ""}`}
                        />
                    )}
                    <span className="font-medium text-foreground/80">
                        {toolLabel}
                    </span>
                    {(hasContent || event.durationMs > 0) && (
                        <span className="text-muted-foreground/60">
                            {"\u00b7"}
                        </span>
                    )}
                    <StatusIcon
                        className={`h-3 w-3 shrink-0 ${statusColor} ${hasContent ? "" : "hidden"} ${isRunning ? "animate-spin" : ""}`}
                    />
                    {event.durationMs > 0 && (
                        <span className="text-muted-foreground">
                            {formatDuration(event.durationMs)}
                        </span>
                    )}
                    {event.filePath && (
                        <>
                            <span className="text-muted-foreground/60">
                                {"\u00b7"}
                            </span>
                            <span className="truncate text-muted-foreground font-mono text-[11px]">
                                {shortenPath(event.filePath)}
                            </span>
                        </>
                    )}
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
                        {formatTimestamp(event.timestamp)}
                    </span>
                </button>
                {statsSummary && (
                    <span className="mt-1 text-[11px] text-muted-foreground/70 pl-5.5">
                        {statsSummary}
                    </span>
                )}
                {hasContent && !expanded && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground/70 pl-5.5 line-clamp-2">
                        {formatToolOutputPreview(previewContent)}
                    </p>
                )}
                {hasContent && expanded && (
                    <div className="mt-2 pl-5.5 text-[12px] text-foreground/80 max-h-[400px] overflow-y-auto">
                        <MarkdownRenderer content={expandedContent!} />
                    </div>
                )}
            </div>
        </div>
    );
};

const AssistantIntentBubble = ({ event }: { event: AssistantText }) => (
    <div className="flex flex-col gap-1 items-start">
        <div className="flex items-start gap-2 max-w-[75%] rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/80 dark:bg-zinc-800/40 px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-violet-500 dark:text-violet-400" />
            <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground/80 break-words">
                    {event.text}
                </span>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {formatTimestamp(event.timestamp)}
            </span>
        </div>
    </div>
);

const AssistantMessageBubble = ({ event }: { event: AssistantText }) => (
    <div className="flex flex-col gap-1 items-start">
        <span className="text-xs text-muted-foreground">
            {getHarnessLabel(event.harnessType)}
            {event.model && (
                <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                    {event.model}
                </span>
            )}
            {" \u00b7 "}
            {formatTimestamp(event.timestamp)}
        </span>
        <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-gradient-to-br from-white to-slate-100 dark:from-zinc-700/80 dark:to-zinc-900/80 text-foreground border border-slate-200/50 dark:border-white/10 shadow-sm">
            <MarkdownRenderer content={event.text} />
        </div>
    </div>
);

const MaxTurnsReachedBubble = ({ event }: { event: MaxTurnsReached }) => (
    <div className="flex flex-col gap-1 items-start w-full">
        <div className="flex items-start gap-2.5 w-full max-w-[75%] rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5 text-xs">
            <OctagonX className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                    Max turns reached
                </p>
                <p className="mt-0.5 text-amber-700/80 dark:text-amber-400/70">
                    This message reached the limit of {event.maxTurns} turn
                    {event.maxTurns !== 1 ? "s" : ""}. Type &ldquo;continue&rdquo; to
                    continue development.
                </p>
            </div>
            <span className="shrink-0 text-[10px] text-amber-600/60 dark:text-amber-400/50">
                {formatTimestamp(event.timestamp)}
            </span>
        </div>
    </div>
);

const AgentResultBubble = ({ event }: { event: AgentResult }) => {
    const isError = event.isError === true;
    const errors = isError && event.errors ? event.errors : undefined;

    const parts: string[] = [];
    if (typeof event.numTurns === "number") {
        parts.push(
            `${event.numTurns} turn${event.numTurns !== 1 ? "s" : ""}`,
        );
    }
    if (typeof event.durationMs === "number") {
        parts.push(formatLongDuration(event.durationMs));
    }

    const hasErrors = !!errors && errors.length > 0;

    if (parts.length === 0 && !hasErrors) {
        return null;
    }

    const StatusIcon = isError ? CircleDot : CheckCircle2;
    const statusColor = isError ? "text-amber-500" : "text-emerald-500";

    return (
        <div className="flex w-full flex-col items-start gap-1 py-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <StatusIcon className={`h-3 w-3 ${statusColor}`} />
                {parts.length > 0 && <span>{parts.join(" · ")}</span>}
                {parts.length > 0 && (
                    <span className="text-muted-foreground/50">{"·"}</span>
                )}
                <span className="text-muted-foreground/50">
                    {formatTimestamp(event.timestamp)}
                </span>
            </div>
            {hasErrors && (
                <ul className="flex flex-col items-start gap-0.5 pl-4.5 text-[11px] text-amber-600 dark:text-amber-400/80">
                    {errors.map((message, index) => (
                        <li key={`${index}-${message}`}>{message}</li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const UserPromptBubble = ({ event }: { event: UserPrompt }) => (
    <div className="flex flex-col gap-1 items-end">
        <span className="text-xs text-muted-foreground">
            You {" \u00b7 "} {formatTimestamp(event.timestamp)}
        </span>
        <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-md shadow-slate-500/15 dark:from-slate-600 dark:to-slate-700">
            <MarkdownRenderer content={event.text} />
        </div>
    </div>
);

export const TranscriptEventBubble = ({
    event,
}: {
    event: TranscriptEvent;
}) => {
    switch (event.kind) {
        case "tool-invocation":
            return <ToolInvocationBubble event={event} />;
        case "tool-result":
            return <ToolResultBubble event={event} />;
        case "assistant-text":
            return event.display === "intent" ? (
                <AssistantIntentBubble event={event} />
            ) : (
                <AssistantMessageBubble event={event} />
            );
        case "user-prompt":
            return <UserPromptBubble event={event} />;
        case "max-turns-reached":
            return <MaxTurnsReachedBubble event={event} />;
        case "agent-result":
            return <AgentResultBubble event={event} />;
        default:
            return null;
    }
};
