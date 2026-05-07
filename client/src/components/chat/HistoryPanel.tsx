import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileDiff as FileDiffIcon,
  GitCommit,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppContext } from "@/contexts/AppContext";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  type Commit,
  type CommitFile,
  clearError,
  fetchCommitDiff,
  fetchCommitHistory,
  fetchFileDiff,
  selectCommit,
  selectFile,
} from "@/store/slices/gitSlice";
import { cn } from "@/lib/utils";
import { UnifiedDiffViewer } from "./UnifiedDiffViewer";

const COMMIT_PAGE_LIMIT = 20;

const formatRelative = (iso: string) => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return formatDistanceToNow(new Date(ms), { addSuffix: true });
  } catch {
    return iso;
  }
};

const shortHash = (commitId: string) => commitId.slice(0, 7);

const changeTypeMeta = (
  changeType: string,
): { label: string; className: string } => {
  const upper = changeType?.toUpperCase?.() ?? "";
  if (upper.startsWith("A"))
    return {
      label: "A",
      className:
        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    };
  if (upper.startsWith("D"))
    return {
      label: "D",
      className:
        "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    };
  if (upper.startsWith("R"))
    return {
      label: "R",
      className:
        "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    };
  if (upper.startsWith("M"))
    return {
      label: "M",
      className:
        "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    };
  return {
    label: upper.slice(0, 1) || "?",
    className:
      "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  };
};

interface CommitRowProps {
  commit: Commit;
  isSelected: boolean;
  isLoadingFiles: boolean;
  files: CommitFile[];
  onToggle: () => void;
  onFileSelect: (filePath: string) => void;
}

const CommitRow = ({
  commit,
  isSelected,
  isLoadingFiles,
  files,
  onToggle,
  onFileSelect,
}: CommitRowProps) => {
  return (
    <li
      className={cn(
        "rounded-lg border border-slate-200/60 dark:border-white/10 bg-white/80 dark:bg-zinc-900/40 transition",
        isSelected &&
          "border-emerald-300/70 ring-1 ring-emerald-300/40 dark:border-emerald-500/40",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2 text-left"
      >
        <span className="mt-0.5 text-muted-foreground">
          {isSelected ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800 text-muted-foreground">
          <GitCommit className="h-3.5 w-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium">
            {commit.commitMessage || "(no message)"}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{shortHash(commit.commitId)}</span>
            {commit.author?.userId ? <span>· {commit.author.userId}</span> : null}
            <span>· {formatRelative(commit.date)}</span>
            {commit.tags?.length ? (
              <span className="flex flex-wrap gap-1">
                {commit.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {tag}
                  </Badge>
                ))}
              </span>
            ) : null}
          </span>
        </span>
      </button>

      {isSelected ? (
        <div className="border-t border-slate-200/60 dark:border-white/10 px-3 py-2">
          {isLoadingFiles ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading files…
            </div>
          ) : files.length === 0 ? (
            <p className="text-xs text-muted-foreground">No files reported.</p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => {
                const meta = changeTypeMeta(file.changeType);
                return (
                  <li key={`${file.fileName}-${file.changeType}`}>
                    <button
                      type="button"
                      onClick={() => onFileSelect(file.newPath || file.fileName)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-100/70 dark:hover:bg-zinc-800/60"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold",
                          meta.className,
                        )}
                        title={file.changeType}
                      >
                        {meta.label}
                      </span>
                      <span className="truncate font-mono text-[11px]">
                        {file.newPath || file.fileName}
                      </span>
                      <FileDiffIcon className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
};

export const HistoryPanel = () => {
  const dispatch = useAppDispatch();
  const { runPixel } = useAppContext();
  const projectId = useAppSelector((state) => state.chat.projectId);
  const {
    commits,
    selectedCommitId,
    commitFiles,
    selectedFilePath,
    fileDiff,
    isLoadingCommits,
    isLoadingFiles,
    isLoadingDiff,
    error,
    offset,
    hasMore,
  } = useAppSelector((state) => state.git);

  const typedRunPixel = runPixel as <T = unknown>(p: string) => Promise<T>;

  const selectedCommit = useMemo(
    () => commits.find((c) => c.commitId === selectedCommitId) ?? null,
    [commits, selectedCommitId],
  );

  const handleToggleCommit = (commitId: string) => {
    if (!projectId) return;
    if (selectedCommitId === commitId) {
      dispatch(selectCommit(null));
      return;
    }
    dispatch(selectCommit(commitId));
    dispatch(
      fetchCommitDiff({ projectId, commitId, runPixel: typedRunPixel }),
    );
  };

  const handleFileSelect = (filePath: string) => {
    if (!projectId || !selectedCommitId) return;
    dispatch(selectFile(filePath));
    dispatch(
      fetchFileDiff({
        projectId,
        commitId: selectedCommitId,
        filePath,
        runPixel: typedRunPixel,
      }),
    );
  };

  const handleLoadMore = () => {
    if (!projectId || !hasMore || isLoadingCommits) return;
    dispatch(
      fetchCommitHistory({
        projectId,
        runPixel: typedRunPixel,
        limit: COMMIT_PAGE_LIMIT,
        offset,
        append: true,
      }),
    );
  };

  const handleRefresh = () => {
    if (!projectId || isLoadingCommits) return;
    dispatch(clearError());
    dispatch(
      fetchCommitHistory({
        projectId,
        runPixel: typedRunPixel,
        limit: COMMIT_PAGE_LIMIT,
        offset: 0,
        append: false,
      }),
    );
  };

  const handleDiffOpenChange = (open: boolean) => {
    if (!open) dispatch(selectFile(null));
  };

  const showInitialSkeleton = isLoadingCommits && commits.length === 0;
  const showEmpty = !isLoadingCommits && !error && commits.length === 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col rounded-b-xl border border-t-0 border-slate-200/50 dark:border-white/10 bg-gradient-to-b from-white/90 via-slate-50/40 to-sky-50/20 dark:from-zinc-900/80 dark:via-zinc-800/60 dark:to-zinc-900/60 shadow-lg shadow-slate-400/5 dark:shadow-black/20 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/50 dark:border-white/10 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitCommit className="h-4 w-4 text-emerald-500" />
          Commit history
          {commits.length > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {commits.length}
            </Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRefresh}
          disabled={isLoadingCommits || !projectId}
          title="Refresh"
        >
          <RefreshCcw
            className={cn(
              "h-3.5 w-3.5",
              isLoadingCommits && "animate-spin",
            )}
          />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {error ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex flex-1 flex-col gap-1">
              <span>{error}</span>
              <button
                type="button"
                onClick={handleRefresh}
                className="self-start text-[11px] underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {showInitialSkeleton ? (
          <ul className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                key={i}
                className="h-14 animate-pulse rounded-lg bg-slate-200/40 dark:bg-zinc-700/30"
              />
            ))}
          </ul>
        ) : showEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <GitCommit className="h-6 w-6 text-muted-foreground/50" />
            <p>No commits yet for this project.</p>
            <p>Send a message and I'll show what changed here.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {commits.map((commit) => (
              <CommitRow
                key={commit.commitId}
                commit={commit}
                isSelected={selectedCommitId === commit.commitId}
                isLoadingFiles={
                  isLoadingFiles && selectedCommitId === commit.commitId
                }
                files={
                  selectedCommitId === commit.commitId ? commitFiles : []
                }
                onToggle={() => handleToggleCommit(commit.commitId)}
                onFileSelect={handleFileSelect}
              />
            ))}
          </ul>
        )}

        {hasMore && commits.length > 0 ? (
          <div className="pt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleLoadMore}
              disabled={isLoadingCommits}
            >
              {isLoadingCommits ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={!!selectedFilePath && !!selectedCommit}
        onOpenChange={handleDiffOpenChange}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 break-all font-mono text-sm">
              {fileDiff ? (
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold",
                    changeTypeMeta(fileDiff.changeType).className,
                  )}
                >
                  {changeTypeMeta(fileDiff.changeType).label}
                </span>
              ) : null}
              {selectedFilePath ?? "Diff"}
            </DialogTitle>
            {selectedCommit ? (
              <DialogDescription className="text-xs">
                {shortHash(selectedCommit.commitId)} ·{" "}
                {selectedCommit.commitMessage}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="max-h-[70vh] min-h-[200px] overflow-hidden">
            {isLoadingDiff ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading diff…
              </div>
            ) : fileDiff?.isBinary ? (
              <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Binary file — no textual diff to display.
              </div>
            ) : fileDiff ? (
              <div className="flex flex-col gap-2">
                {fileDiff.isTruncated ? (
                  <div className="rounded-md border border-amber-300/60 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    This diff was truncated — showing a partial view.
                  </div>
                ) : null}
                <UnifiedDiffViewer
                  diff={fileDiff.diff}
                  className="max-h-[60vh]"
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No diff available.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HistoryPanel;
