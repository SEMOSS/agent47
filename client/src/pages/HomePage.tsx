import { ChatInterface } from "@/components";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/contexts";
import { attachPreviewIssues } from "@/lib/previewIssues";
import { cn } from "@/lib/utils";
import { Env } from "@semoss/sdk";
import { useAppDispatch, useAppSelector } from "@/store";
import { bumpIframeRefresh, setActiveProject } from "@/store/slices/chatSlice";
import { createReactProject } from "@/store/slices/createProjectSlice";
import {
  capturePreviewIssue,
  setPreviewIssueCapability,
} from "@/store/slices/issuesSlice";
import { hydrateDefaultMcps } from "@/store/slices/mcpSlice";
import { queryMyProjects } from "@/store/slices/myProjects";
import {
  Copy,
  FolderOpen,
  Hammer,
  Info,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";

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
const PROJECTS_PAGE_SIZE = 20;

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

const normalizeModulePath = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
};

const buildIframeSrc = (projectId: string, modulePath?: string) => {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) {
    return "";
  }

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : import.meta.env.ENDPOINT || "";

  if (!origin) {
    return "";
  }

  const normalizedModulePath = normalizeModulePath(modulePath);
  return new URL(
    `${normalizedModulePath}/public_home/${normalizedProjectId}/portals/`,
    origin,
  ).toString();
};

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

const buildProjectBrowsePixel = (filterWord: string, offset: number) => {
  const trimmed = filterWord.trim();
  const encodedFilter = trimmed ? `<encode>${trimmed}</encode>` : "";

  return `MyProjects ( metaKeys = [ "tag" , "domain" , "data classification" , "data restrictions" , "description" ] , metaFilters = [ { 'tag': 'CLAUDE'} ] , filterWord = [ "${encodedFilter}" ] , onlyPortals = [ true ] , limit = [ ${PROJECTS_PAGE_SIZE} ] , offset = [ ${offset} ] ) ;`;
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
  const previewSessionId = useAppSelector((state) => state.issues.previewSessionId);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isLoadProjectOpen, setIsLoadProjectOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectSearchResults, setProjectSearchResults] = useState<ProjectSummary[]>([]);
  const [projectSearchOffset, setProjectSearchOffset] = useState(0);
  const [projectSearchHasMore, setProjectSearchHasMore] = useState(true);
  const [isProjectSearchLoading, setIsProjectSearchLoading] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const activeProject = myProjects.find((p) => getProjectId(p) === projectId);
  const activeProjectName =
    getProjectName(activeProject).trim() ||
    (projectId ? "Untitled project" : "");
  const storedProjectIdRef = useRef<string | null>(null);
  const didCheckStoredProjectRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewCleanupRef = useRef<(() => void) | null>(null);
  const projectResultsRef = useRef<HTMLDivElement | null>(null);
  const projectSearchRequestIdRef = useRef(0);

  const trimmedProjectName = newProjectName.trim();
  const isCreateDisabled = trimmedProjectName.length === 0 || isCreatingProject;
  const trimmedProjectSearchQuery = projectSearchQuery.trim();

  const iframeSrc = buildIframeSrc(projectId, Env.MODULE);

  useEffect(() => {
    void dispatch(hydrateDefaultMcps({ runPixel }));
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

  useEffect(() => {
    return () => {
      previewCleanupRef.current?.();
      previewCleanupRef.current = null;
    };
  }, []);

  const handleBuildAndPublish = useCallback(async () => {
    if (!projectId || isBuilding) return;
    setIsBuilding(true);
    const buildAndPublishPixel = `BuildAndPublishApp(project='${projectId}')`;
    try {
      await runPixel(buildAndPublishPixel);
    } catch (error) {
      console.warn("BuildAndPublishApp failed:", error);
    } finally {
      setTimeout(() => {
        dispatch(bumpIframeRefresh());
        setIsBuilding(false);
      }, 500);
    }
  }, [projectId, isBuilding, runPixel, dispatch]);

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

  const handleCopyTechnicalDetail = useCallback(async (label: string, value: string) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch (error) {
      console.error(`Failed to copy ${label}:`, error);
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  }, []);

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

  const loadProjectsPage = useCallback(
    async ({ query, offset, append }: { query: string; offset: number; append: boolean }) => {
      const requestId = projectSearchRequestIdRef.current + 1;
      projectSearchRequestIdRef.current = requestId;
      setIsProjectSearchLoading(true);

      try {
        const response = await runPixel<ProjectSummary[]>(
          buildProjectBrowsePixel(query, offset),
        );

        if (projectSearchRequestIdRef.current !== requestId) {
          return;
        }

        const projects = response ?? [];
        setProjectSearchResults((current) =>
          append ? [...current, ...projects] : projects,
        );
        setProjectSearchOffset(offset + projects.length);
        setProjectSearchHasMore(projects.length === PROJECTS_PAGE_SIZE);
      } catch (error) {
        if (projectSearchRequestIdRef.current !== requestId) {
          return;
        }

        console.error("Failed to load projects:", error);
        toast.error("Could not load projects right now.");
        setProjectSearchResults((current) => (append ? current : []));
        setProjectSearchOffset(offset);
        setProjectSearchHasMore(false);
      } finally {
        if (projectSearchRequestIdRef.current === requestId) {
          setIsProjectSearchLoading(false);
        }
      }
    },
    [runPixel],
  );

  const resetProjectSearch = useCallback(() => {
    projectSearchRequestIdRef.current += 1;
    setProjectSearchQuery("");
    setProjectSearchResults([]);
    setProjectSearchOffset(0);
    setProjectSearchHasMore(true);
    setIsProjectSearchLoading(false);
  }, []);

  const handleProjectResultsScroll = useCallback(() => {
    const container = projectResultsRef.current;
    if (!container || isProjectSearchLoading || !projectSearchHasMore) {
      return;
    }

    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (remaining > 80) {
      return;
    }

    void loadProjectsPage({
      query: trimmedProjectSearchQuery,
      offset: projectSearchOffset,
      append: true,
    });
  }, [
    isProjectSearchLoading,
    loadProjectsPage,
    projectSearchHasMore,
    projectSearchOffset,
    trimmedProjectSearchQuery,
  ]);

  useEffect(() => {
    if (!isLoadProjectOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadProjectsPage({
        query: trimmedProjectSearchQuery,
        offset: 0,
        append: false,
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isLoadProjectOpen, loadProjectsPage, trimmedProjectSearchQuery]);

  const handlePreviewLoad = useCallback(() => {
    previewCleanupRef.current?.();
    previewCleanupRef.current = null;

    if (!iframeRef.current || !projectId) {
      dispatch(
        setPreviewIssueCapability({
          status: "idle",
          message: "Open and test the preview to capture issues.",
        }),
      );
      return;
    }

    previewCleanupRef.current = attachPreviewIssues(iframeRef.current, {
      onSignal: (transport) => {
        dispatch(
          capturePreviewIssue({
            transport,
            context: {
              projectId,
              roomId,
              previewSessionId,
            },
          }),
        );
      },
      onCapabilityChange: (capability) => {
        dispatch(setPreviewIssueCapability(capability));
      },
    });
  }, [dispatch, previewSessionId, projectId, roomId]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <section className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/50 dark:border-white/10 bg-white/70 shadow-xl shadow-slate-400/10 backdrop-blur-xl dark:bg-zinc-900/60 dark:shadow-black/20">
        <div className="flex items-center gap-2 border-b border-slate-200/50 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-zinc-800/60">
          <button
            type="button"
            onClick={() => dispatch(bumpIframeRefresh())}
            className="rounded-md p-1 text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 hover:text-foreground transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleBuildAndPublish}
            disabled={!projectId || isBuilding}
            className="rounded-md p-1 text-muted-foreground hover:bg-slate-200/60 dark:hover:bg-zinc-700/60 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Rebuild & publish project"
          >
            <Hammer
              className={cn("h-3.5 w-3.5", isBuilding && "animate-pulse")}
            />
          </button>
          <div className="ml-1 flex min-w-0 flex-1 items-center justify-between gap-4 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-zinc-900/40">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
                Current Project
              </span>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {activeProjectName || "No project selected"}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-slate-200/60 hover:text-foreground dark:hover:bg-zinc-700/60"
                      title="Technical details"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[30rem] max-w-[calc(100vw-2rem)] space-y-2 p-3"
                  >
                    <div className="rounded-md border border-slate-200/60 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-zinc-900/40">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Room ID
                      </p>
                      <p className="mt-1 text-[11px] font-mono leading-relaxed text-foreground">
                        {roomId || "Unavailable"}
                      </p>
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopyTechnicalDetail("Room ID", roomId)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    </div>
                    <div className="rounded-md border border-slate-200/60 bg-slate-50/70 p-2 dark:border-white/10 dark:bg-zinc-900/40">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Project ID
                      </p>
                      <p className="mt-1 text-[11px] font-mono leading-relaxed text-foreground">
                        {projectId || "Unavailable"}
                      </p>
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          handleCopyTechnicalDetail("Project ID", projectId)
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg bg-white/90 px-3 text-xs font-medium shadow-sm dark:bg-zinc-800/70"
                onClick={() => setIsCreateProjectOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New project
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg bg-white/90 px-3 text-xs font-medium shadow-sm dark:bg-zinc-800/70"
                onClick={() => setIsLoadProjectOpen(true)}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Open project
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setChatCollapsed((v) => !v)}
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-slate-200/60 hover:text-foreground dark:hover:bg-zinc-700/60"
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
            ref={iframeRef}
            title="Semoss App"
            src={iframeSrc}
            className="h-full w-full"
            key={iframeRefreshKey}
            onLoad={handlePreviewLoad}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-muted-foreground">{emptyStateMessage}</p>
            {showCreateProjectMessage ? (
              <p className="text-xs text-muted-foreground">
                Use New project to create your first workspace, or Open project to switch to an existing one.
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
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Start a fresh workspace with a clear project name.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={handleCreateProjectSubmit}
            autoComplete="off"
          >
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Project Name</Label>
              <Input
                id="new-project-name"
                name="agent47-project-name"
                placeholder="New project"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
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
                {isCreatingProject ? "Creating..." : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Load Project Dialog */}
      <Dialog
        open={isLoadProjectOpen}
        onOpenChange={(nextOpen) => {
          setIsLoadProjectOpen(nextOpen);
          if (!nextOpen) {
            resetProjectSearch();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Project</DialogTitle>
            <DialogDescription>
              Choose an existing project to bring into the active workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="project-search">Search projects</Label>
              <Input
                id="project-search"
                name="agent47-project-search"
                placeholder="Search by project name or ID"
                value={projectSearchQuery}
                onChange={(event) => setProjectSearchQuery(event.target.value)}
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
                autoFocus
              />
            </div>
            {isProjectSearchLoading && projectSearchResults.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">Loading projects...</p>
              </div>
            ) : myProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved projects found yet.
              </p>
            ) : projectSearchResults.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  No matching projects
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a different project name or paste part of the project ID.
                </p>
              </div>
            ) : (
              <div
                ref={projectResultsRef}
                onScroll={handleProjectResultsScroll}
                className="max-h-72 overflow-y-auto rounded-lg border border-border/60"
              >
                {projectSearchResults.map((project, index) => {
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
                {isProjectSearchLoading ? (
                  <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    Loading more projects...
                  </div>
                ) : null}
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
