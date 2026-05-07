import { useMemo } from "react";
import { GitCommit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAppContext } from "@/contexts/AppContext";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  fetchCommitDiff,
  selectCommit,
} from "@/store/slices/gitSlice";
import { cn } from "@/lib/utils";

interface LatestCommitChipProps {
  onOpenHistory: () => void;
  className?: string;
}

const truncate = (value: string, max = 64) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

const formatRelative = (iso: string) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return formatDistanceToNow(new Date(ms), { addSuffix: true });
  } catch {
    return null;
  }
};

export const LatestCommitChip = ({
  onOpenHistory,
  className,
}: LatestCommitChipProps) => {
  const dispatch = useAppDispatch();
  const { runPixel } = useAppContext();
  const projectId = useAppSelector((state) => state.chat.projectId);
  const commits = useAppSelector((state) => state.git.commits);
  const selectedCommitId = useAppSelector(
    (state) => state.git.selectedCommitId,
  );
  const commitFiles = useAppSelector((state) => state.git.commitFiles);

  const latest = commits[0];
  const fileCount = useMemo(() => {
    if (!latest) return null;
    if (selectedCommitId === latest.commitId) return commitFiles.length;
    return null;
  }, [latest, selectedCommitId, commitFiles.length]);

  if (!latest) return null;

  const relative = formatRelative(latest.date);

  const handleClick = () => {
    if (!projectId) {
      onOpenHistory();
      return;
    }
    if (selectedCommitId !== latest.commitId) {
      dispatch(selectCommit(latest.commitId));
      dispatch(
        fetchCommitDiff({
          projectId,
          commitId: latest.commitId,
          runPixel: runPixel as <T = unknown>(p: string) => Promise<T>,
        }),
      );
    }
    onOpenHistory();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex w-full items-start gap-2 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-zinc-800/60 px-3 py-2 text-left text-xs shadow-sm transition hover:border-emerald-300/70 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/5",
        className,
      )}
      title="Open this commit in History"
    >
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <GitCommit className="h-3.5 w-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>Latest commit</span>
          {relative ? <span>· {relative}</span> : null}
          {fileCount !== null ? (
            <span>
              · {fileCount} {fileCount === 1 ? "file" : "files"}
            </span>
          ) : null}
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {truncate(latest.commitMessage)}
        </span>
      </span>
      <span className="ml-auto self-center text-[10px] uppercase tracking-wide text-emerald-600 opacity-0 transition group-hover:opacity-100">
        View
      </span>
    </button>
  );
};

export default LatestCommitChip;
