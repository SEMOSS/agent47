import { ChatInterface } from "@/components";
import { useAppContext } from "@/contexts";
import { Env } from "@semoss/sdk";
import { useAppDispatch, useAppSelector } from "@/store";
import { setActiveProject } from "@/store/slices/chatSlice";
import { callGetUserMcps } from "@/store/slices/mcpSlice";
import { queryMyProjects } from "@/store/slices/myProjects";
import { useEffect, useRef, useState } from "react";

type ProjectSummary = {
  project_id?: string;
  projectId?: string;
  project?: string;
  id?: string;
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

/**
 * Renders the home page, currently displaying an example component.
 *
 * @component
 */
export const HomePage = () => {
  const dispatch = useAppDispatch();
  const { runPixel } = useAppContext();
  const projectId = useAppSelector((state) => state.chat.projectId);
  const myProjects = useAppSelector(
    (state) => state.myProjects.projects,
  ) as ProjectSummary[];
  const iframeRefreshKey = useAppSelector(
    (state) => state.chat.iframeRefreshKey,
  );
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const storedProjectIdRef = useRef<string | null>(null);
  const didCheckStoredProjectRef = useRef(false);

  // Derive base URL at runtime: current page origin + MODULE from injected semoss-env.
  let iframeSrc = "";
  if (projectId) {
    const runtimeModule = Env.MODULE || import.meta.env.MODULE || "/Monolith";
    iframeSrc = `${window.location.origin}${runtimeModule}/public_home/${projectId}/portals/`;
  }

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
      <section className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-white/80 shadow-sm">
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
      <div className="h-full w-full lg:w-[400px] lg:shrink-0 xl:w-[560px] 2xl:w-[660px]">
        <ChatInterface />
      </div>
    </div>
  );
};
