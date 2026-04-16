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
    FileSearch,
    Loader2,
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
    Read: FileSearch,
    Grep: FileSearch,
    Glob: FileSearch,
    Bash: Terminal,
    Agent: Bot,
};

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
    const Icon = TOOL_ICONS[event.toolName] ?? Wrench;
    const label = event.subagentType
        ? `${event.toolName} (${event.subagentType})`
        : event.toolName;

    return (
        <div className="flex flex-col gap-1 items-start">
            <div className="flex items-start gap-2 max-w-[75%] rounded-xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/80 dark:bg-zinc-800/40 px-3 py-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500 dark:text-blue-400" />
                <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground/80 break-all">
                        {label}
                    </span>
                    {event.description && (
                        <span className="ml-1.5 text-muted-foreground break-words">
                            {event.description}
                        </span>
                    )}
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
    const StatusIcon = isError
        ? XCircle
        : isSuccess
          ? CheckCircle2
          : CircleDot;
    const statusColor = isError
        ? "text-red-500"
        : isSuccess
          ? "text-emerald-500"
          : "text-amber-500";

    const statsSummary = event.stats ? buildStatsSummary(event.stats) : "";
    const hasContent = !!event.content;
    const ExpandIcon = expanded ? ChevronDown : ChevronRight;

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
                            className={`h-3.5 w-3.5 shrink-0 ${statusColor}`}
                        />
                    )}
                    <span className="font-medium text-foreground/80">
                        Tool Result
                    </span>
                    <span className="text-muted-foreground/60">{"\u00b7"}</span>
                    <StatusIcon
                        className={`h-3 w-3 shrink-0 ${statusColor} ${hasContent ? "" : "hidden"}`}
                    />
                    <span className="text-muted-foreground">
                        {formatDuration(event.durationMs)}
                    </span>
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
                        {event.content}
                    </p>
                )}
                {hasContent && expanded && (
                    <div className="mt-2 pl-5.5 text-[12px] text-foreground/80 max-h-[400px] overflow-y-auto">
                        <MarkdownRenderer content={event.content!} />
                    </div>
                )}
            </div>
        </div>
    );
};

const AssistantTextBubble = ({ event }: { event: AssistantText }) => (
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
            return <AssistantTextBubble event={event} />;
        case "user-prompt":
            return null;
        default:
            return null;
    }
};
