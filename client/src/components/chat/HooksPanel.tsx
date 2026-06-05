import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useAppContext } from "@/contexts/AppContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  type HookEntry,
  clearHooks,
  fetchAgentHooks,
  saveAgentHooks,
} from "@/store/slices/hooksSlice";
import { HookEditDialog } from "./HookEditDialog";

export function HooksPanel() {
  const dispatch = useAppDispatch();
  const { runPixel } = useAppContext();
  const workspaceId = useAppSelector((state) => state.chat.workspaceId);
  const hooks = useAppSelector((state) => state.hooks.hooks);
  const knownKinds = useAppSelector((state) => state.hooks.knownKinds);
  const isLoading = useAppSelector((state) => state.hooks.isLoading);
  const loadedWorkspaceId = useAppSelector((state) => state.hooks.workspaceId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Fetch on workspace switch (and on mount when workspaceId is set).
  // Clear stale hooks when there's no active workspace so the panel
  // doesn't render another workspace's entries.
  useEffect(() => {
    if (!workspaceId) {
      dispatch(clearHooks());
      return;
    }
    if (loadedWorkspaceId === workspaceId) return;
    void dispatch(fetchAgentHooks({ workspaceId, runPixel }));
  }, [workspaceId, loadedWorkspaceId, dispatch, runPixel]);

  const openCreate = () => {
    setEditingIndex(null);
    setDialogOpen(true);
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const persistHooks = (nextHooks: HookEntry[]) => {
    if (!workspaceId) return;
    void dispatch(
      saveAgentHooks({ workspaceId, hooks: nextHooks, runPixel }),
    );
  };

  const handleSave = (hook: HookEntry) => {
    const nextHooks =
      editingIndex !== null
        ? hooks.map((h, i) => (i === editingIndex ? hook : h))
        : [...hooks, hook];
    persistHooks(nextHooks);
    setDialogOpen(false);
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    const nextHooks = hooks.filter((_, i) => i !== index);
    persistHooks(nextHooks);
  };

  const editingHook = editingIndex !== null ? hooks[editingIndex] : undefined;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Hooks</h2>
          <p className="text-sm text-muted-foreground">
            Run Pixel expressions at agent lifecycle events. Hooks fire in
            order of definition for every matching event.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openCreate}
          disabled={!workspaceId}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add hook
        </Button>
      </div>

      {!workspaceId ? (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">No active workspace</CardTitle>
            <CardDescription>
              Open a workspace to view and manage its hooks.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading && hooks.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Loading hooks…
        </div>
      ) : hooks.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">No hooks configured</CardTitle>
            <CardDescription>
              Add a hook to run a Pixel expression at agent lifecycle events
              (e.g. <code>afterRun</code>, <code>beforeTool</code>).
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {hooks.map((hook, index) => (
            <HookRow
              key={`${hook.kind}-${index}`}
              hook={hook}
              onEdit={() => openEdit(index)}
              onDelete={() => handleDelete(index)}
            />
          ))}
        </div>
      )}

      <HookEditDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingIndex(null);
        }}
        knownKinds={knownKinds}
        editingHook={editingHook}
        onSave={handleSave}
      />
    </div>
  );
}

interface HookRowProps {
  hook: HookEntry;
  onEdit: () => void;
  onDelete: () => void;
}

function HookRow({ hook, onEdit, onDelete }: HookRowProps) {
  const isPixel = hook.kind === "pixel";
  return (
    <Card className="border-slate-200/60 dark:border-white/10 shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isPixel ? "default" : "secondary"}>{hook.kind}</Badge>
          {(hook.events ?? []).length > 0 ? (
            (hook.events ?? []).map((event) => (
              <Badge key={event} variant="outline" className="font-mono text-[10px]">
                {event}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-[10px]">
              all events
            </Badge>
          )}
        </div>
        {isPixel && hook.pixel ? (
          <CardDescription className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
            {hook.pixel}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </CardContent>
    </Card>
  );
}
