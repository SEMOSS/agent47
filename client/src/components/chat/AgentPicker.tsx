import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAppContext } from "@/contexts/AppContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createAgent, fetchAgents } from "@/store/slices/agentsSlice";
import { setWorkspaceId } from "@/store/slices/chatSlice";

/**
 * Sidebar picker for the active agent (workspace). Reads the current
 * `workspaceId` from `chat` state; on change dispatches `setWorkspaceId`,
 * which transitively re-fetches hooks via {@link HooksPanel}'s existing
 * workspace-switch effect.
 *
 * <p>The "+ New agent" affordance is rendered as a sibling button rather
 * than an item inside the Select dropdown because shadcn's Select swallows
 * clicks on non-SelectItem children — wrapping the trigger in a separate
 * button keeps the UX one-tap without fighting the Select primitive.
 */
export function AgentPicker() {
  const dispatch = useAppDispatch();
  const { runPixel } = useAppContext();
  const workspaceId = useAppSelector((state) => state.chat.workspaceId);
  const agents = useAppSelector((state) => state.agents.agents);
  const isLoading = useAppSelector((state) => state.agents.isLoading);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch once on mount. The agent list rarely changes mid-session, and
  // an explicit "Refresh" affordance would just clutter the sidebar.
  // Users still see a brand-new agent immediately via the optimistic
  // insert in createAgent.fulfilled.
  useEffect(() => {
    void dispatch(fetchAgents({ runPixel }));
  }, [dispatch, runPixel]);

  const selectValue = workspaceId || undefined;

  const handleSelect = (value: string) => {
    dispatch(setWorkspaceId(value));
  };

  const handleCreate = async () => {
    setCreateError(null);
    setIsCreating(true);
    try {
      const result = await dispatch(
        createAgent({ name: newName, runPixel }),
      ).unwrap();
      dispatch(setWorkspaceId(result.workspaceId));
      setIsCreateOpen(false);
      setNewName("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const trimmedName = newName.trim();
  const disableCreate = isCreating || trimmedName.length === 0;

  return (
    <div className="space-y-2">
      <Label>Agent</Label>
      <div className="flex items-center gap-2">
        <Select value={selectValue} onValueChange={handleSelect}>
          <SelectTrigger className="flex-1">
            <SelectValue
              placeholder={
                isLoading
                  ? "Loading agents…"
                  : agents.length === 0
                    ? "No agents — create one"
                    : "Select an agent"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {agents.length === 0 ? (
              <SelectItem value="__none__" disabled>
                No agents available
              </SelectItem>
            ) : (
              agents.map((a) => (
                <SelectItem key={a.workspaceId} value={a.workspaceId}>
                  <span className="flex flex-col items-start">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {a.workspaceId.slice(0, 18)}
                      {a.workspaceId.length > 18 ? "…" : ""}
                    </span>
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => {
            setNewName("");
            setCreateError(null);
            setIsCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>
      {workspaceId ? (
        <p className="font-mono text-[10px] text-muted-foreground">
          {workspaceId}
        </p>
      ) : null}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New agent</DialogTitle>
            <DialogDescription>
              Creates a new workspace-typed project. The agent will be
              empty until you bind a model and configure it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-agent-name">Name</Label>
            <Input
              id="new-agent-name"
              value={newName}
              autoFocus
              placeholder="My agent"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !disableCreate) {
                  void handleCreate();
                }
              }}
            />
            {createError ? (
              <p className="text-xs text-destructive">{createError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={disableCreate}
              className="gap-2"
            >
              {isCreating ? <Spinner className="size-4" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
