import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  type EngineCategory,
  removeSelectedEngine,
} from "@/store/slices/enginesSlice";
import { EngineSelectionDialog } from "./EngineSelectionDialog";
import { getCategoryIcon, getEngineIcon } from "./engineIcon";

interface CategoryConfig {
  category: EngineCategory;
  label: string;
  description: string;
  modalTitle: string;
  modalDescription: string;
  emptyHint: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    category: "MODEL",
    label: "Models",
    description: "Language and embedding models",
    modalTitle: "Models",
    modalDescription:
      "Select the models you want available to the agent.",
    emptyHint: "No models selected",
  },
  {
    category: "DATABASE",
    label: "Databases",
    description: "Relational and document databases",
    modalTitle: "Databases",
    modalDescription:
      "Select the databases you want available to the agent.",
    emptyHint: "No databases selected",
  },
  {
    category: "STORAGE",
    label: "Storage",
    description: "File and object storage",
    modalTitle: "Storage",
    modalDescription:
      "Select the storage engines you want available to the agent.",
    emptyHint: "No storage engines selected",
  },
  {
    category: "VECTOR",
    label: "Vector Databases",
    description: "Embedding and similarity search",
    modalTitle: "Vector Databases",
    modalDescription:
      "Select the vector databases you want available to the agent.",
    emptyHint: "No vector databases selected",
  },
];

export function EnginesPanel() {
  const [openCategory, setOpenCategory] = useState<EngineCategory | null>(null);
  const dispatch = useAppDispatch();
  const selectedEngines = useAppSelector(
    (state) => state.engines.selectedEngines,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] font-medium text-slate-500 dark:text-slate-400">
          Engines
        </p>
        <h2 className="text-lg font-semibold">Available engines</h2>
        <p className="text-sm text-muted-foreground">
          Pre-select the engines you want the agent to incorporate. Selected
          engines are added to the system prompt — the agent can still use
          others if you mention them.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {CATEGORIES.map((config) => {
          const CategoryIcon = getCategoryIcon(config.category);
          const selected = selectedEngines[config.category];
          return (
            <div
              key={config.category}
              className="rounded-xl border border-slate-200/60 bg-white/70 p-4 dark:border-white/10 dark:bg-zinc-900/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-zinc-800">
                  <CategoryIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{config.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {config.description}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setOpenCategory(config.category)}
                    >
                      Manage
                    </Button>
                  </div>
                  {selected.length === 0 ? (
                    <p className="pt-1 text-xs italic text-muted-foreground">
                      {config.emptyHint}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {selected.map((engine) => {
                        const Icon = getEngineIcon(
                          engine.subtype,
                          config.category,
                        );
                        return (
                          <span
                            key={engine.id}
                            className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-zinc-800 dark:text-slate-200"
                          >
                            <Icon className="h-3 w-3 shrink-0" />
                            <span className="max-w-[12rem] truncate">
                              {engine.name}
                            </span>
                            <button
                              type="button"
                              className="ml-0.5 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-zinc-700 dark:hover:text-slate-100"
                              onClick={() =>
                                dispatch(
                                  removeSelectedEngine({
                                    type: config.category,
                                    engineId: engine.id,
                                  }),
                                )
                              }
                              aria-label={`Remove ${engine.name}`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {CATEGORIES.map((config) => (
        <EngineSelectionDialog
          key={config.category}
          category={config.category}
          title={config.modalTitle}
          description={config.modalDescription}
          open={openCategory === config.category}
          onOpenChange={(open) =>
            setOpenCategory(open ? config.category : null)
          }
        />
      ))}
    </div>
  );
}
