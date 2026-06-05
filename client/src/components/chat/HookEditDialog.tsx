import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { HookEntry } from "@/store/slices/hooksSlice";

const ALL_EVENTS = [
  "onRoomCreation",
  "beforeRun",
  "afterAgentInit",
  "beforeTool",
  "afterTool",
  "afterRun",
  "beforeAgentDeInit",
] as const;

type EventName = (typeof ALL_EVENTS)[number];

interface HookEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knownKinds: string[];
  /** When provided, the dialog renders in edit mode. */
  editingHook?: HookEntry;
  /** Called with the new/updated hook entry on Save. */
  onSave: (hook: HookEntry) => void;
}

const DEFAULT_KIND = "pixel";

export function HookEditDialog({
  open,
  onOpenChange,
  knownKinds,
  editingHook,
  onSave,
}: HookEditDialogProps) {
  const [kind, setKind] = useState<string>(DEFAULT_KIND);
  const [pixel, setPixel] = useState<string>("");
  const [events, setEvents] = useState<Set<EventName>>(new Set());

  // Reset form whenever the dialog opens with a (potentially different)
  // editingHook. Avoids stale state leaking between create and edit flows.
  useEffect(() => {
    if (!open) return;
    if (editingHook) {
      setKind(editingHook.kind);
      setPixel(editingHook.pixel ?? "");
      setEvents(new Set((editingHook.events ?? []) as EventName[]));
    } else {
      setKind(
        knownKinds.includes(DEFAULT_KIND)
          ? DEFAULT_KIND
          : knownKinds[0] ?? DEFAULT_KIND,
      );
      setPixel("");
      setEvents(new Set());
    }
  }, [open, editingHook, knownKinds]);

  const requiresPixel = kind === "pixel";
  const pixelTrimmed = pixel.trim();
  const isSaveDisabled = requiresPixel && pixelTrimmed.length === 0;
  const dialogTitle = editingHook ? "Edit hook" : "Add hook";

  const orderedEvents = useMemo(
    () => ALL_EVENTS.filter((e) => events.has(e)),
    [events],
  );

  const toggleEvent = (event: EventName, checked: boolean) => {
    setEvents((prev) => {
      const next = new Set(prev);
      if (checked) next.add(event);
      else next.delete(event);
      return next;
    });
  };

  const handleSave = () => {
    if (isSaveDisabled) return;
    const hook: HookEntry = { kind };
    if (requiresPixel) hook.pixel = pixelTrimmed;
    if (orderedEvents.length > 0) hook.events = orderedEvents;
    onSave(hook);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Hooks fire at agent lifecycle events. Pixel hooks run a Pixel
            expression on the active run's insight.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kind */}
          <div className="space-y-2">
            <Label htmlFor="hook-kind">Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger id="hook-kind">
                <SelectValue placeholder="Choose a hook kind" />
              </SelectTrigger>
              <SelectContent>
                {knownKinds.length === 0 ? (
                  <SelectItem value={DEFAULT_KIND} disabled>
                    No kinds registered
                  </SelectItem>
                ) : (
                  knownKinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Pixel expression — only for kind="pixel" */}
          {requiresPixel ? (
            <div className="space-y-2">
              <Label htmlFor="hook-pixel">Pixel expression</Label>
              <Textarea
                id="hook-pixel"
                value={pixel}
                onChange={(e) => setPixel(e.target.value)}
                placeholder="MyReactor(arg='value');"
                rows={4}
                spellCheck={false}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Fires as-is on the run's insight via{" "}
                <code>Insight.runPixel(...)</code>.
              </p>
            </div>
          ) : null}

          {/* Events filter */}
          <div className="space-y-2">
            <Label>Events</Label>
            <p className="text-xs text-muted-foreground">
              When to fire. Leave all unchecked to fire on every event the
              hook applies to.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {ALL_EVENTS.map((event) => {
                const checkboxId = `hook-event-${event}`;
                return (
                  <label
                    key={event}
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={events.has(event)}
                      onCheckedChange={(checked) =>
                        toggleEvent(event, checked === true)
                      }
                    />
                    <span className="font-mono text-xs">{event}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaveDisabled}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
