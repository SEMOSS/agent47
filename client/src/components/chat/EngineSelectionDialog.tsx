import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  addSelectedEngine,
  type EngineCategory,
  type EngineItem,
  fetchEnginesByType,
  removeSelectedEngine,
  resetBrowse,
  setEngineSearch,
} from "@/store/slices/enginesSlice";
import { getEngineIcon } from "./engineIcon";

interface EngineSelectionDialogProps {
  category: EngineCategory;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EngineSelectionDialog({
  category,
  title,
  description,
  open,
  onOpenChange,
}: EngineSelectionDialogProps) {
  const dispatch = useAppDispatch();
  const { runPixel } = useAppContext();
  const browse = useAppSelector((state) => state.engines.browse[category]);
  const selected = useAppSelector(
    (state) => state.engines.selectedEngines[category],
  );

  const search = browse.search;

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      dispatch(
        fetchEnginesByType({ type: category, runPixel, filterWord: search }),
      );
    }, 200);
    return () => clearTimeout(handle);
  }, [open, search, category, dispatch, runPixel]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      dispatch(resetBrowse(category));
    }
    onOpenChange(next);
  };

  const isSelected = (id: string) => selected.some((e) => e.id === id);

  const handleToggle = (engine: EngineItem, checked: boolean) => {
    if (checked) {
      dispatch(addSelectedEngine({ type: category, engine }));
    } else {
      dispatch(removeSelectedEngine({ type: category, engineId: engine.id }));
    }
  };

  const items = browse.items;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(event) =>
              dispatch(
                setEngineSearch({ type: category, search: event.target.value }),
              )
            }
            className="h-8 text-sm"
            autoFocus
          />
          {items.length === 0 && !browse.isLoading ? (
            <p className="text-xs text-muted-foreground">
              {search
                ? "No engines match your search."
                : "No engines available for this category."}
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-white/70 dark:bg-zinc-800/50 p-2">
              {items.map((engine) => {
                const Icon = getEngineIcon(engine.subtype, category);
                const checked = isSelected(engine.id);
                return (
                  <label
                    key={engine.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-accent/40",
                      checked && "bg-accent/60",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        handleToggle(engine, value === true)
                      }
                    />
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {engine.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {engine.id}
                      </span>
                    </div>
                  </label>
                );
              })}
              {browse.isLoading ? (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  Loading...
                </div>
              ) : null}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
