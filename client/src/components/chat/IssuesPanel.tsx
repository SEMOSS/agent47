import { useEffect, useMemo, useState } from "react";
import { Eye, MessageSquareWarning, Trash2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  type PreviewIssueRecord,
  formatIssueTimestamp,
  getIssueKindLabel,
} from "@/lib/previewIssues";
import {
  deleteIssue,
  markIssueReviewed,
  selectIssues,
} from "@/store/slices/issuesSlice";
import { cn } from "@/lib/utils";

type IssuesFilter = "all" | "app" | "api";

type IssuesPanelProps = {
  onAskToFix: (issueIds: string[]) => void;
};

const filterMatches = (record: PreviewIssueRecord, filter: IssuesFilter) => {
  if (filter === "all") {
    return true;
  }

  if (filter === "api") {
    return record.kind === "api";
  }

  return record.kind === "runtime" || record.kind === "console";
};

const tryDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const formatIssueDetailValue = (value: unknown): string => {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const candidate = structuredClone(value) as Record<string, unknown>;

  if (typeof candidate.body === "string") {
    const rawBody = candidate.body;
    if (rawBody.startsWith("expression=")) {
      const encodedExpression = rawBody.slice("expression=".length);
      candidate.body = `expression=\n${tryDecodeURIComponent(encodedExpression)}`;
    } else if (rawBody.includes("%")) {
      candidate.body = tryDecodeURIComponent(rawBody);
    }
  }

  if (typeof candidate.url === "string") {
    candidate.url = tryDecodeURIComponent(candidate.url);
  }

  if (typeof candidate.body === "string" && candidate.body.length > 4000) {
    candidate.body = `${candidate.body.slice(0, 4000)}\n\n[truncated for display]`;
  }

  return JSON.stringify(candidate, null, 2);
};

export const IssuesPanel = ({ onAskToFix }: IssuesPanelProps) => {
  const dispatch = useAppDispatch();
  const records = useAppSelector(selectIssues);
  const capability = useAppSelector((state) => state.issues.capability);
  const [filter, setFilter] = useState<IssuesFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailIssueId, setDetailIssueId] = useState<string | null>(null);

  const filteredRecords = useMemo(
    () => records.filter((record) => filterMatches(record, filter)),
    [filter, records],
  );

  const detailRecord =
    records.find((record) => record.id === detailIssueId) ?? null;
  const detailBlockClassName =
    "mt-1.5 max-h-[22vh] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-slate-50";

  useEffect(() => {
    setSelectedIds((previous) =>
      previous.filter((id) => filteredRecords.some((record) => record.id === id)),
    );
  }, [filteredRecords]);

  const toggleSelectedId = (id: string, nextChecked: boolean) => {
    setSelectedIds((previous) =>
      nextChecked
        ? Array.from(new Set([...previous, id]))
        : previous.filter((existingId) => existingId !== id),
    );
  };

  const handleAskSelected = () => {
    if (selectedIds.length === 0) {
      return;
    }

    onAskToFix(selectedIds);
  };

  return (
    <>
      <div className="mt-0 flex flex-1 min-h-0 flex-col rounded-b-xl border border-t-0 border-slate-200/50 dark:border-white/10 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl shadow-lg shadow-slate-400/5">
        <div className="border-b border-slate-200/50 dark:border-white/10 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight">
                Issues
              </h3>
              <p className="text-sm text-muted-foreground">
                As you test and click through the app, technical issues may appear here for review and repair.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={handleAskSelected}
              className="gap-2"
            >
              <Wrench className="h-4 w-4" />
              Ask agent to fix
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {([
              ["all", "All"],
              ["app", "App"],
              ["api", "API"],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? "default" : "outline"}
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {filteredRecords.length === 0 ? (
            <Card className="border-dashed bg-slate-50/70 dark:bg-zinc-900/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">No issues yet</CardTitle>
                <CardDescription>
                  Test the preview and any technical issues that show up can be captured here. {capability.message}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => {
                const isSelected = selectedIds.includes(record.id);
                return (
                  <Card
                    key={record.id}
                    className={cn(
                      "border-slate-200/60 dark:border-white/10 shadow-sm",
                      record.reviewed && "opacity-80",
                    )}
                  >
                    <CardHeader className="space-y-3 pb-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            toggleSelectedId(record.id, checked === true)
                          }
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-sm leading-5">
                              {record.title}
                            </CardTitle>
                            <Badge variant="outline">
                              {getIssueKindLabel(record.kind)}
                            </Badge>
                            <Badge variant="secondary">{record.count}x</Badge>
                            {record.reviewed ? (
                              <Badge variant="secondary">Resolved</Badge>
                            ) : null}
                          </div>
                          <CardDescription className="line-clamp-2">
                            {record.message}
                          </CardDescription>
                          <p className="text-xs text-muted-foreground">
                            Last seen {formatIssueTimestamp(record.lastSeenAt)}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setDetailIssueId(record.id)}
                      >
                        <Eye className="h-4 w-4" />
                        View details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => onAskToFix([record.id])}
                      >
                        <MessageSquareWarning className="h-4 w-4" />
                        Ask agent to fix
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          dispatch(
                            markIssueReviewed({
                              id: record.id,
                              reviewed: !record.reviewed,
                            }),
                          )
                        }
                      >
                        {record.reviewed ? "Mark unresolved" : "Mark resolved"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-destructive hover:text-destructive"
                        onClick={() =>
                          dispatch(
                            deleteIssue({
                              id: record.id,
                            }),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={detailRecord !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailIssueId(null);
          }
        }}
      >
        <DialogContent className="max-h-[94vh] w-[min(94vw,1180px)] max-w-[1180px] overflow-hidden p-0">
          <DialogHeader>
            <div className="border-b border-slate-200/60 px-5 py-4 dark:border-white/10">
              <DialogTitle>{detailRecord?.title ?? "Issue details"}</DialogTitle>
              <DialogDescription className="mt-1.5">
                Review safe technical details before sending this issue to the agent.
              </DialogDescription>
            </div>
          </DialogHeader>

          {detailRecord ? (
            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="grid gap-2 rounded-xl border border-slate-200/60 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-zinc-900/50 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Type
                  </p>
                  <p>{getIssueKindLabel(detailRecord.kind)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Last seen
                  </p>
                  <p>{formatIssueTimestamp(detailRecord.lastSeenAt)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Occurrences
                  </p>
                  <p>{detailRecord.count}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Source
                  </p>
                  <p className="break-all">{detailRecord.source || "Preview"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Message
                </p>
                <pre className={detailBlockClassName}>
                  {detailRecord.message}
                </pre>
              </div>

              {detailRecord.stack ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Stack
                  </p>
                  <pre className={detailBlockClassName}>
                    {detailRecord.stack}
                  </pre>
                </div>
              ) : null}

              <div className="grid gap-4 xl:grid-cols-2">
                {detailRecord.request ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Request
                    </p>
                    <pre className={detailBlockClassName}>
                      {formatIssueDetailValue(detailRecord.request)}
                    </pre>
                  </div>
                ) : null}

                {detailRecord.response ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Response
                    </p>
                    <pre className={detailBlockClassName}>
                      {formatIssueDetailValue(detailRecord.response)}
                    </pre>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
