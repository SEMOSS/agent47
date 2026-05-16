import { useMemo } from "react";
import { cn } from "@/lib/utils";

type DiffLineKind = "added" | "removed" | "hunk" | "meta" | "context";

interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

const classifyLine = (line: string): DiffLineKind => {
  if (line.startsWith("@@")) return "hunk";
  if (
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename ") ||
    line.startsWith("Binary files")
  ) {
    return "meta";
  }
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  return "context";
};

const lineClasses: Record<DiffLineKind, string> = {
  added: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  removed: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  hunk: "bg-sky-500/10 text-sky-700 dark:text-sky-300 font-medium",
  meta: "text-muted-foreground",
  context: "text-foreground/80",
};

interface UnifiedDiffViewerProps {
  diff: string;
  className?: string;
}

export const UnifiedDiffViewer = ({
  diff,
  className,
}: UnifiedDiffViewerProps) => {
  const lines = useMemo<DiffLine[]>(() => {
    if (!diff) return [];
    return diff.split("\n").map((text) => ({
      kind: classifyLine(text),
      text,
    }));
  }, [diff]);

  if (lines.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200/60 dark:border-white/10 px-4 py-6 text-center text-xs text-muted-foreground">
        No diff content available.
      </div>
    );
  }

  return (
    <pre
      className={cn(
        "max-h-full overflow-auto rounded-md border border-slate-200/60 dark:border-white/10 bg-slate-50/60 dark:bg-zinc-900/60 font-mono text-xs leading-5",
        className,
      )}
    >
      <code className="block">
        {lines.map((line, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional and stable for a given diff
            key={index}
            className={cn(
              "block whitespace-pre px-3 py-px",
              lineClasses[line.kind],
            )}
          >
            {line.text === "" ? " " : line.text}
          </span>
        ))}
      </code>
    </pre>
  );
};

export default UnifiedDiffViewer;
