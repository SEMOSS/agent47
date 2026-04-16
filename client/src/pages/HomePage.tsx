import { ChatInterface, WebSocketTestPanel } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppContext } from "@/contexts";
import { cn } from "@/lib/utils";
import { Env } from "@semoss/sdk";
import { useAppDispatch, useAppSelector } from "@/store";
import { bumpIframeRefresh, setActiveProject } from "@/store/slices/chatSlice";
import { createReactProject } from "@/store/slices/createProjectSlice";
import { callGetUserMcps } from "@/store/slices/mcpSlice";
import { queryMyProjects } from "@/store/slices/myProjects";
import {
  ChevronDown,
  FolderOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Wifi,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

type ProjectSummary = {
  project_id?: string;
  projectId?: string;
  project?: string;
  id?: string;
  project_name?: string;
  projectName?: string;
  name?: string;
  project_date_last_edited?: string;
};

const PROJECT_ID_STORAGE_KEY = "semoss.activeProjectId";

const readStoredProjectId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return localStorage.getItem(PROJECT_ID_STORAGE_KEY) ?? "";
  } catch (error) {
    console.warn("Unable to read stored project id:", error);
    return "";
  }
};

const writeStoredProjectId = (value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(PROJECT_ID_STORAGE_KEY, value);
  } catch (error) {
    console.warn("Unable to store project id:", error);
  }
};

const getProjectId = (project?: ProjectSummary) =>
  project?.project_id ??
  project?.projectId ??
  project?.project ??
  project?.id ??
  "";

const getProjectName = (project?: ProjectSummary) =>
  project?.project_name ?? project?.projectName ?? project?.name ?? "";

const formatProjectDate = (value?: string) => {
  if (!value) {
    return "Last edited date unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Renders the home page, currently displaying an example component.
 *
 * @component
 */
export const HomePage = () => {
  const dispatch = useAppDispatch();
  const { runPixel, runPixelAsync, getPixelAsyncResult, getPixelJobStreaming } =
    useAppContext();
  const projectId = useAppSelector((state) => state.chat.projectId);
  const roomId = useAppSelector((state) => state.chat.roomId);
  const myProjects = useAppSelector(
    (state) => state.myProjects.projects,
  ) as ProjectSummary[];
  const iframeRefreshKey = useAppSelector(
    (state) => state.chat.iframeRefreshKey,
  );
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isLoadProjectOpen, setIsLoadProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [showWsTest, setShowWsTest] = useState(false);

  const activeProject = myProjects.find((p) => getProjectId(p) === projectId);
  const activeProjectName =
    getProjectName(activeProject).trim() ||
    (projectId ? "Untitled project" : "");
  const storedProjectIdRef = useRef<string | null>(null);
  const didCheckStoredProjectRef = useRef(false);

  const trimmedProjectName = newProjectName.trim();
  const isCreateDisabled = trimmedProjectName.length === 0 || isCreatingProject;

  // DEV BLOCK
  let iframeSrc = "";
  if (
    import.meta.env.ENDPOINT == "http://localhost:9090" ||
    import.meta.env.ENDPOINT == "http://localhost:8080"
  ) {
    iframeSrc = projectId
      ? // ? `${import.meta.env.ENDPOINT}/semoss-ui/packages/client/dist/#/s/${projectId}`
        `${import.meta.env.ENDPOINT}/SemossWeb/packages/client/dist/#/s/${projectId}`
      : "";
  } else {
    iframeSrc = projectId
      ? `${import.meta.env.ENDPOINT}/${import.meta.env.MODULE}/public_home/${projectId}/portals/`
      : "";
  }

  //PROD BLOCK
  //   const iframeSrc = `${import.meta.env.ENDPOINT}/${import.meta.env.MODULE}/public_home/${projectId}/portals/`;

  useEffect(() => {
    dispatch(callGetUserMcps({ runPixel }));
    let isMounted = true;
    dispatch(queryMyProjects({ runPixel }))
      .unwrap()
      .catch(() => null)
      .finally(() => {
        if (isMounted) {
          setProjectsLoaded(true);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [dispatch, runPixel]);

  useEffect(() => {
    if (didCheckStoredProjectRef.current) {
      return;
    }

    didCheckStoredProjectRef.current = true;
    const storedProjectId = readStoredProjectId().trim();
    storedProjectIdRef.current = storedProjectId || null;

    if (storedProjectId && storedProjectId !== projectId) {
      dispatch(setActiveProject(storedProjectId));
    }
  }, [dispatch, projectId]);

  useEffect(() => {
    if (!projectsLoaded) {
      return;
    }
    if (storedProjectIdRef.current) {
      return;
    }
    if (projectId) {
      return;
    }

    const firstProjectId = getProjectId(myProjects[0]);
    if (!firstProjectId) {
      return;
    }

    dispatch(setActiveProject(firstProjectId));
  }, [dispatch, myProjects, projectId, projectsLoaded]);

  useEffect(() => {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return;
    }

    writeStoredProjectId(normalizedProjectId);
  }, [projectId]);

  const handleCreateProject = useCallback(async () => {
    if (!trimmedProjectName || isCreatingProject) {
      return;
    }

    setIsCreatingProject(true);
    try {
      await dispatch(
        createReactProject({
          projectName: trimmedProjectName,
          runPixel,
          runPixelAsync,
          getPixelAsyncResult,
          getPixelJobStreaming,
        }),
      ).unwrap();
      dispatch(queryMyProjects({ runPixel }));
      setIsCreateProjectOpen(false);
      setNewProjectName("");
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setIsCreatingProject(false);
    }
  }, [
    dispatch,
    isCreatingProject,
    runPixel,
    runPixelAsync,
    getPixelAsyncResult,
    getPixelJobStreaming,
    trimmedProjectName,
  ]);

  const handleCreateProjectSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleCreateProject();
    },
    [handleCreateProject],
  );

  const handleSelectProject = useCallback(
    async (project: ProjectSummary) => {
      const nextProjectId = getProjectId(project);
      if (!nextProjectId) {
        return;
      }
      await runPixel(
        `${`PullProjectFolderFromCloud(project='${nextProjectId}')`}`,
      );
      dispatch(setActiveProject(nextProjectId));
      setIsLoadProjectOpen(false);
    },
    [dispatch],
  );

  const showCreateProjectMessage =
    projectsLoaded && !projectId && myProjects.length === 0;
  const showSelectingProjectMessage =
    projectsLoaded && !projectId && myProjects.length > 0;
  const showLoadingMessage = !projectsLoaded && !projectId;
  const emptyStateMessage = showCreateProjectMessage
    ? "No projects yet. Create a new project to get started."
    : showSelectingProjectMessage
      ? "Selecting your first project..."
      : "Loading your projects...";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <section className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 shadow-xl shadow-slate-400/10 dark:shadow-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-white/10 bg-slate-50/80 dark:bg-zinc-800/60 px-3 py-1.5">
          <button
            type="button"
            onClick={() => dispatch(bumpIframeRefresh())}
            className="rounded-md p-1 text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 hover:text-foreground transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowWsTest((v) => !v)}
              className="rounded-md p-1 text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 hover:text-foreground transition-colors"
              title="Test WebSocket"
            >
              <Wifi className="h-3.5 w-3.5" />
            </button>
            {showWsTest && (
              <WebSocketTestPanel onClose={() => setShowWsTest(false)} />
            )}
          </div>
          <TooltipProvider delayDuration={100}>
            {roomId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 truncate max-w-[6rem] rounded-md bg-slate-200/70 dark:bg-zinc-700/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground cursor-default">
                    Room: {roomId}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-xs break-all rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg border border-slate-200/50 dark:border-white/10"
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    Room ID
                  </p>
                  <p className="font-mono text-xs">{roomId}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {projectId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 truncate max-w-[6rem] rounded-md bg-slate-200/70 dark:bg-zinc-700/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground cursor-default">
                    Project: {projectId}
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-xs break-all rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg border border-slate-200/50 dark:border-white/10"
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                    Project ID
                  </p>
                  <p className="font-mono text-xs">{projectId}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
          <div className="mx-auto flex h-6 w-full max-w-md items-center rounded-md bg-slate-200/60 dark:bg-zinc-700/50 px-3">
            <span className="truncate text-xs text-muted-foreground">/</span>
          </div>
          {activeProjectName && (
            <span className="shrink-0 truncate max-w-[12rem] rounded-md bg-slate-200/70 dark:bg-zinc-700/50 px-2 py-0.5 text-xs text-muted-foreground">
              {activeProjectName}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-md p-1 text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 hover:text-foreground transition-colors"
                title="Project actions"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setIsCreateProjectOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                New Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsLoadProjectOpen(true)}>
                <FolderOpen className="mr-2 h-3.5 w-3.5" />
                Load Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setChatCollapsed((v) => !v)}
            className="rounded-md p-1 text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 hover:text-foreground transition-colors"
            title={chatCollapsed ? "Show chat" : "Hide chat"}
          >
            {chatCollapsed ? (
              <PanelRightOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelRightClose className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        {projectId ? (
          <iframe
            title="Semoss App"
            src={iframeSrc}
            className="h-full w-full"
            key={iframeRefreshKey}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
            {showCreateProjectMessage ? (
              <p className="text-xs text-muted-foreground">
                Use the Create button to spin up your first workspace.
              </p>
            ) : null}
            {showLoadingMessage ? (
              <div className="mt-2 h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground" />
            ) : null}
          </div>
        )}
      </section>
      {!chatCollapsed && (
        <div className="h-full w-full lg:w-[400px] lg:shrink-0 xl:w-[560px] 2xl:w-[460px]">
          <ChatInterface />
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog
        open={isCreateProjectOpen}
        onOpenChange={(nextOpen) => {
          if (!isCreatingProject) {
            setIsCreateProjectOpen(nextOpen);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Enter a project name to start a fresh workspace.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateProjectSubmit}>
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Project Name</Label>
              <Input
                id="new-project-name"
                placeholder="New project"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateProjectOpen(false)}
                disabled={isCreatingProject}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreateDisabled}>
                {isCreatingProject ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Load Project Dialog */}
      <Dialog open={isLoadProjectOpen} onOpenChange={setIsLoadProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load Project</DialogTitle>
            <DialogDescription>
              Select a project to switch your active workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {myProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved projects found yet.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60">
                {myProjects.map((project, index) => {
                  const nextProjectId = getProjectId(project);
                  const isActive = nextProjectId === projectId;
                  const projectKey =
                    nextProjectId || project.project_name || `project-${index}`;
                  return (
                    <button
                      key={projectKey}
                      type="button"
                      onClick={() => handleSelectProject(project)}
                      disabled={!nextProjectId}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 border-b border-border/60 px-3 py-2 text-left text-sm transition hover:bg-accent/50 last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50",
                        isActive && "bg-accent/70",
                      )}
                    >
                      <span className="font-medium">
                        {project.project_name || "Untitled project"}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {nextProjectId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatProjectDate(project.project_date_last_edited)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsLoadProjectOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
