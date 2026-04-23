import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import type {
    AssistantText,
    ToolInvocation,
    ToolResult,
    ToolStats,
    TranscriptEvent,
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
    Pencil,
    Sparkles,
    Terminal,
    Wrench,
    XCircle,
} from "lucide-react";
import { useState } from "react";

const formatTimestamp = (timestamp: string) => {
    try {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return timestamp;
    }
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

const toTitleCase = (value: string) =>
    value
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());

const getToolDisplayName = (toolName: string) => {
    const normalized = toolName.trim();
    if (!normalized) {
        return "Tool";
    }

    return TOOL_LABELS[normalized.toLowerCase()] ?? toTitleCase(normalized);
};

const getToolIcon = (toolName: string) =>
    TOOL_ICONS[toolName.trim().toLowerCase()] ?? Wrench;

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

const ToolInvocationBubble = ({ event }: { event: ToolInvocation }) => {
    const Icon = getToolIcon(event.toolName);
    const label = event.subagentType
        ? `${getToolDisplayName(event.toolName)} (${event.subagentType})`
        : getToolDisplayName(event.toolName);

    return (
        <div className="flex flex-col gap-1 items-start">
            <div className="flex items-start gap-2 max-w-[75%] rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/80 dark:bg-zinc-800/40 px-3 py-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500 dark:text-blue-400" />
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-0.5">
                        <span className="shrink-0 whitespace-nowrap font-medium text-foreground/80">
                            {label}
                        </span>
                        {event.description && (
                            <span className="min-w-0 break-all text-muted-foreground">
                                {event.description}
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
        ? `${getToolDisplayName(event.toolName)} Result`
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
                        {previewContent}
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
            Agent
            {event.model && (
                <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                    {event.model}
                </span>
            )}
            {" \u00b7 "}
            {formatTimestamp(event.timestamp)}
        </span>
        <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-white/90 dark:bg-zinc-800/70 text-foreground border border-slate-200/50 dark:border-white/10 shadow-sm">
            <MarkdownRenderer content={event.text} />
            {event.isPartial ? (
                <span className="inline-block ml-1 h-3 w-0.5 animate-pulse bg-foreground/60" />
            ) : null}
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
            return null;
        default:
            return null;
    }
};
