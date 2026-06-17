import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ConversationHistoryPanel } from "@/components/chat/ConversationHistoryPanel";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { TranscriptEventBubble } from "@/components/chat/TranscriptEventBubble";
import { IssuesPanel } from "@/components/chat/IssuesPanel";
import { EnginesPanel } from "@/components/chat/EnginesPanel";
import { AgentPicker } from "@/components/chat/AgentPicker";
import { HooksPanel } from "@/components/chat/HooksPanel";
import { HistoryPanel } from "@/components/chat/HistoryPanel";
import { LatestCommitChip } from "@/components/chat/LatestCommitChip";
import { ConfirmationDialog } from "@/library/ConfirmationDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAppContext } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";
import { buildIssuesRepairPrompt } from "@/lib/previewIssues";
import {
  type EffortLevel,
  SLASH_COMMANDS,
  type SlashCommandSpec,
} from "@/lib/parseSlashCommands";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  type ChatMessage,
  DEFAULT_MAX_TURNS,
  type HarnessType,
  type PermissionMode,
  sanitizeMaxTurns,
  setEffort,
  setEngineDisplayName,
  setEngineId,
  setHarnessType,
  setInputMessage,
  setMaxTurns,
  setPermissionMode,
  setThinkingEnabled,
  setWorkspaceId,
  startNewRoom,
} from "@/store/slices/chatSlice";
import {
  addSelectedMcp,
  callGetUserMcps,
  type MCPItem,
  removeSelectedMcp,
  resetMcpPickerState,
  setMcpSearch,
} from "@/store/slices/mcpSlice";
import {
  markAllIssuesSeen,
  markIssuesSent,
  selectIssues,
  selectUnseenIssuesCount,
} from "@/store/slices/issuesSlice";
import {
  createSkill,
  deleteSkill,
  querySkills,
  updateSkill,
} from "@/store/slices/skillsSlice";
import { loadProjectEngineDependencies } from "@/store/slices/enginesSlice";
import { clearGitState, fetchCommitHistory } from "@/store/slices/gitSlice";
import { submitAgentMessage } from "@/store/thunks/submitAgentMessage";
import { getTranscriptEventStableKey } from "@/types/transcript";

type SkillTab = {
  id: string;
  label: string;
  skillName: string;
  content: string;
};

const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode;
  label: string;
}> = [
  { value: "acceptEdits", label: "Accept Edits" },
  { value: "default", label: "Default" },
  { value: "plan", label: "Plan" },
  { value: "bypassPermissions", label: "Bypass Permissions" },
];

const HARNESS_TYPE_OPTIONS: Array<{
  value: HarnessType;
  label: string;
}> = [
  { value: "claude_code", label: "Claude Code" },
  { value: "github_copilot_py", label: "GitHub Copilot" },
  { value: "semoss", label: "SEMOSS" },
];

const getHarnessLabel = (harnessType: HarnessType) =>
  HARNESS_TYPE_OPTIONS.find((option) => option.value === harnessType)?.label ??
  "Agent";

const isPermissionMode = (value: string): value is PermissionMode =>
  PERMISSION_MODE_OPTIONS.some((option) => option.value === value);
const MAX_CHAT_INPUT_HEIGHT_PX = 240;

type SlashMenuContext = {
  replaceStart: number;
  replaceEnd: number;
  mode: "command" | "arg";
  argQuery: string;
  commands: SlashCommandSpec[];
  signature: string;
};

const computeSlashMenuContext = (
  value: string,
  cursor: number,
): SlashMenuContext | null => {
  const uptoCursor = value.slice(0, cursor);
  const lineStart = uptoCursor.lastIndexOf("\n") + 1;
  const line = uptoCursor.slice(lineStart);
  if (!line.startsWith("/")) {
    return null;
  }

  const rest = line.slice(1);
  const spaceIndex = rest.indexOf(" ");

  if (spaceIndex === -1) {
    const query = rest.toLowerCase();
    const commands = SLASH_COMMANDS.filter((command) =>
      command.name.slice(1).toLowerCase().startsWith(query),
    );
    if (commands.length === 0) {
      return null;
    }
    return {
      replaceStart: lineStart,
      replaceEnd: cursor,
      mode: "command",
      argQuery: "",
      commands,
      signature: `command:${query}`,
    };
  }

  const name = `/${rest.slice(0, spaceIndex)}`.toLowerCase();
  const argQuery = rest.slice(spaceIndex + 1);
  if (argQuery.includes(" ")) {
    return null;
  }
  const command = SLASH_COMMANDS.find(
    (entry) => entry.name.toLowerCase() === name,
  );
  if (!command) {
    return null;
  }
  return {
    replaceStart: lineStart,
    replaceEnd: cursor,
    mode: "arg",
    argQuery,
    commands: [command],
    signature: `arg:${name}:${argQuery.toLowerCase()}`,
  };
};

const currentSlashValue = (
  command: SlashCommandSpec,
  effort: EffortLevel,
  thinkingEnabled: boolean,
): string =>
  command.name === "/effort" ? effort : thinkingEnabled ? "on" : "off";

const MessageBubble = ({
  author,
  role,
  time,
  content,
  status,
  errorDetail,
}: ChatMessage) => {
  const isUser = role === "user";
  const isSystem = role === "system";
  const isLoading = status === "loading";
  const isStreaming = status === "streaming";
  const isError = status === "error";
  const [errorExpanded, setErrorExpanded] = useState(false);

  // Key/value debug rows for a failed run (empties dropped); shown in the
  // expandable detail panel and copied verbatim.
  const errorDetailRows = errorDetail
    ? (
        [
          ["status", errorDetail.status],
          ["error", errorDetail.errorMessage],
          ["harness", errorDetail.harnessType],
          ["runId", errorDetail.runId],
          ["roomId", errorDetail.roomId],
          ["jobId", errorDetail.jobId],
        ] as Array<[string, string | undefined]>
      ).filter((row): row is [string, string] => Boolean(row[1]))
    : [];

  const copyErrorDetail = async () => {
    const text = [content, "", ...errorDetailRows.map(([k, v]) => `${k}: ${v}`)]
      .join("\n")
      .trim();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Error details copied");
    } catch (error) {
      console.error("Failed to copy error details:", error);
      toast.error("Failed to copy error details");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isUser ? "items-end" : "items-start",
      )}
    >
      <span className="text-xs text-muted-foreground">
        {author} · {time}
      </span>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3 text-sm",
          isUser &&
            "bg-gradient-to-r from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700 text-white shadow-md shadow-slate-500/15",
          !isUser &&
            !isError &&
            "bg-white/90 dark:bg-zinc-800/70 text-foreground border border-slate-200/50 dark:border-white/10 shadow-sm",
          isSystem && !isError && "border-dashed",
          isError &&
            "border border-red-300/70 bg-red-50/80 text-red-700 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-300",
        )}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
            <span className="text-sm text-muted-foreground">Thinking...</span>
          </span>
        ) : isStreaming ? (
          <div>
            <MarkdownRenderer content={content} />
            <span className="inline-block ml-1 h-3 w-0.5 animate-pulse bg-foreground/60" />
          </div>
        ) : isError ? (
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="flex items-start gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span>{content}</span>
            </span>
            {errorDetailRows.length > 0 ? (
              <button
                type="button"
                onClick={() => setErrorExpanded((prev) => !prev)}
                className="flex items-center gap-1 self-start text-[11px] font-medium text-red-700/80 hover:text-red-700 dark:text-red-300/80 dark:hover:text-red-300"
              >
                {errorExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Details
              </button>
            ) : null}
            {errorDetailRows.length > 0 && errorExpanded ? (
              <div className="relative max-h-[280px] overflow-y-auto rounded-md border border-red-300/50 bg-red-100/40 p-2 pr-7 font-mono text-[11px] leading-relaxed dark:border-red-500/20 dark:bg-red-950/40">
                <button
                  type="button"
                  onClick={copyErrorDetail}
                  aria-label="Copy error details"
                  className="absolute right-1 top-1 rounded p-1 text-red-700/70 hover:bg-red-200/50 hover:text-red-700 dark:text-red-300/70 dark:hover:bg-red-900/50"
                >
                  <Copy className="h-3 w-3" />
                </button>
                {errorDetailRows.map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="shrink-0 text-red-700/55 dark:text-red-300/55">
                      {key}
                    </span>
                    <span className="whitespace-pre-wrap break-words">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : isSystem ? (
          <span className="text-xs">{content}</span>
        ) : (
          <MarkdownRenderer content={content} />
        )}
      </div>
    </div>
  );
};

/**
 * Basic chat interface with editable Redux-backed settings.
 *
 * @component
 */
export const ChatInterface = () => {
  const dispatch = useAppDispatch();
  const { runPixel, runPixelAsync, getPixelAsyncResult, getPixelJobStreaming } =
    useAppContext();
  const {
    roomId,
    engineId,
    engineDisplayName,
    projectId,
    workspaceId,
    permissionMode,
    harnessType,
    maxTurns,
    inputMessage,
    messages,
    pendingMessageId,
    effort,
    thinkingEnabled,
  } = useAppSelector((state) => state.chat);
  const {
    items: availableMcps,
    pinnedItems: pinnedMcps,
    selectedMcps,
    search: mcpSearch,
    offset: mcpOffset,
    hasMore: mcpHasMore,
    isLoading: isLoadingMcps,
  } = useAppSelector((state) => state.mcp);
  const { skills, claudeMd } = useAppSelector((state) => state.skills);
  const transcriptEvents = useAppSelector((state) => state.transcript.events);
  const issueRecords = useAppSelector(selectIssues);
  const unseenIssuesCount = useAppSelector(selectUnseenIssuesCount);

  const [isConfigurationOpen, setIsConfigurationOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "build" | "issues" | "engines" | "history" | "settings"
  >("build");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [activeSkillTabId, setActiveSkillTabId] = useState<string>("");
  const [editedSkillContentByTabId, setEditedSkillContentByTabId] = useState<
    Record<string, string>
  >({});
  const [skillSaveError, setSkillSaveError] = useState<string | null>(null);
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const [editingSkillTabId, setEditingSkillTabId] = useState<string | null>(
    null,
  );
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillContent, setNewSkillContent] = useState("");
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [createSkillError, setCreateSkillError] = useState<string | null>(null);
  const [engineDropdownOpen, setEngineDropdownOpen] = useState(false);
  const [engineSearch, setEngineSearch] = useState("");
  const [engineResults, setEngineResults] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [engineLoading, setEngineLoading] = useState(false);
  const [pendingHarnessType, setPendingHarnessType] =
    useState<HarnessType | null>(null);
  // Local draft so the field can be cleared/typed freely; committed (and
  // sanitized) to the store on blur.
  const [maxTurnsDraft, setMaxTurnsDraft] = useState(String(maxTurns));

  // Keep the draft aligned when the store value changes from elsewhere.
  useEffect(() => {
    setMaxTurnsDraft(String(maxTurns));
  }, [maxTurns]);

  const commitMaxTurns = () => {
    const next = sanitizeMaxTurns(maxTurnsDraft);
    dispatch(setMaxTurns(next));
    setMaxTurnsDraft(String(next));
  };
  const [slashCursor, setSlashCursor] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const isPinnedToBottomRef = useRef(true);
  const wasStreamingRef = useRef(false);
  const fetchedSkillsProjectIdRef = useRef<string | null>(null);
  const loadedSelectedEnginesProjectIdRef = useRef<string | null>(null);
  const slashSignatureRef = useRef<string | null>(null);
  const trimmedMessage = inputMessage.trim();
  const isStreaming = pendingMessageId !== null;
  const isSendDisabled = trimmedMessage.length === 0 || isStreaming;
  const activeHarnessLabel = getHarnessLabel(harnessType);

  const slashMenu = useMemo(
    () =>
      slashDismissed
        ? null
        : computeSlashMenuContext(inputMessage, slashCursor),
    [inputMessage, slashCursor, slashDismissed],
  );
  const slashCommandIndex = slashMenu
    ? Math.min(activeCommandIndex, slashMenu.commands.length - 1)
    : 0;
  const activeSlashCommand = slashMenu
    ? slashMenu.commands[slashCommandIndex]
    : null;
  const activeSlashOptions = useMemo(() => {
    if (!slashMenu || !activeSlashCommand) {
      return [];
    }
    if (slashMenu.mode === "arg" && slashMenu.argQuery) {
      const query = slashMenu.argQuery.toLowerCase();
      const filtered = activeSlashCommand.options.filter(
        (option) =>
          option.value.toLowerCase().startsWith(query) ||
          option.label.toLowerCase().startsWith(query),
      );
      return filtered.length > 0 ? filtered : activeSlashCommand.options;
    }
    return activeSlashCommand.options;
  }, [slashMenu, activeSlashCommand]);
  const slashOptionIndex =
    activeSlashOptions.length === 0
      ? 0
      : Math.min(Math.max(activeOptionIndex, 0), activeSlashOptions.length - 1);

  useEffect(() => {
    if (!slashMenu) {
      slashSignatureRef.current = null;
      return;
    }
    if (slashSignatureRef.current === slashMenu.signature) {
      return;
    }
    slashSignatureRef.current = slashMenu.signature;
    setActiveCommandIndex(0);
    const command = slashMenu.commands[0];
    const current = currentSlashValue(command, effort, thinkingEnabled);
    const index = command.options.findIndex(
      (option) => option.value === current,
    );
    setActiveOptionIndex(index >= 0 ? index : 0);
  }, [slashMenu, effort, thinkingEnabled]);

  const selectedMcpIds = useMemo(
    () => new Set(selectedMcps.map((mcp) => mcp.id)),
    [selectedMcps],
  );
  const pinnedMcpIds = useMemo(
    () => new Set(pinnedMcps.map((mcp) => mcp.id)),
    [pinnedMcps],
  );

  // Merge non-user legacy chat messages (for example system errors) with
  // transcript events. User prompts already arrive through the transcript
  // stream/history for both harnesses, so rendering chat-state user messages
  // here would duplicate the same bubble.
  type TimelineItem =
    | {
        source: "message";
        createdAt: number | null;
        key: string;
        message: ChatMessage;
      }
    | {
        source: "transcript";
        createdAt: number | null;
        key: string;
        event: (typeof transcriptEvents)[number];
      };

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const message of messages) {
      if (message.role === "user") {
        continue;
      }
      items.push({
        source: "message",
        createdAt: message.createdAt ?? 0,
        key: `msg-${message.id}`,
        message,
      });
    }
    transcriptEvents.forEach((event, index) => {
      const parsed = Date.parse(event.timestamp);
      const stableKey = getTranscriptEventStableKey(event);
      items.push({
        source: "transcript",
        createdAt: Number.isFinite(parsed) ? parsed : null,
        key: stableKey ?? `transcript-${event.kind}-${index}`,
        event,
      });
    });
    // Stable sort: if two items share a createdAt, keep insertion order.
    return items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const aHasTime = a.item.createdAt !== null;
        const bHasTime = b.item.createdAt !== null;

        if (aHasTime && bHasTime && a.item.createdAt !== b.item.createdAt) {
          return (a.item.createdAt ?? 0) - (b.item.createdAt ?? 0);
        }

        if (aHasTime !== bHasTime) {
          return aHasTime ? -1 : 1;
        }

        return a.index - b.index;
      })
      .map(({ item }) => item);
  }, [messages, transcriptEvents]);

  const handleSendMessage = useCallback(() => {
    if (!trimmedMessage) {
      return;
    }

    dispatch(
      submitAgentMessage({
        message: trimmedMessage,
        runPixel,
        runPixelAsync,
        getPixelAsyncResult,
        getPixelJobStreaming,
      }),
    );
  }, [
    dispatch,
    runPixel,
    runPixelAsync,
    getPixelAsyncResult,
    getPixelJobStreaming,
    trimmedMessage,
  ]);

  const resizeChatInput = useCallback(() => {
    const textarea = chatInputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    const nextHeight = Math.min(
      textarea.scrollHeight,
      MAX_CHAT_INPUT_HEIGHT_PX,
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_CHAT_INPUT_HEIGHT_PX ? "auto" : "hidden";
  }, []);

  // Track whether the user is pinned near the bottom. Only user-initiated
  // scrolls (wheel/touch) flip this — programmatic scrollTo calls don't,
  // so smooth auto-scroll animations aren't mistaken for scroll-away.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const updatePinState = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      isPinnedToBottomRef.current = distanceFromBottom < 80;
    };
    container.addEventListener("wheel", updatePinState, { passive: true });
    container.addEventListener("touchmove", updatePinState, {
      passive: true,
    });
    return () => {
      container.removeEventListener("wheel", updatePinState);
      container.removeEventListener("touchmove", updatePinState);
    };
  }, []);

  const handleMessageChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      dispatch(setInputMessage(event.target.value));
      setSlashCursor(event.target.selectionStart ?? event.target.value.length);
      setSlashDismissed(false);
    },
    [dispatch],
  );

  const handleInputSelect = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      setSlashCursor(event.currentTarget.selectionStart ?? 0);
    },
    [],
  );

  const applySlashOption = (command: SlashCommandSpec, value: string) => {
    if (command.name === "/effort") {
      dispatch(setEffort(value as EffortLevel));
      toast.success(`Effort set to ${value}.`);
    } else if (command.name === "/thinking") {
      dispatch(setThinkingEnabled(value === "on"));
      toast.success(`Thinking ${value === "on" ? "enabled" : "disabled"}.`);
    }

    if (slashMenu) {
      const before = inputMessage.slice(0, slashMenu.replaceStart);
      const after = inputMessage.slice(slashMenu.replaceEnd);
      const nextValue = before + after;
      dispatch(setInputMessage(nextValue));
      const caret = before.length;
      setSlashCursor(caret);
      requestAnimationFrame(() => {
        const textarea = chatInputRef.current;
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(caret, caret);
        }
      });
    }

    slashSignatureRef.current = null;
    setSlashDismissed(false);
  };

  const selectSlashCommand = (index: number) => {
    setActiveCommandIndex(index);
    const command = slashMenu?.commands[index];
    if (!command) {
      return;
    }
    const current = currentSlashValue(command, effort, thinkingEnabled);
    const optionIndex = command.options.findIndex(
      (option) => option.value === current,
    );
    setActiveOptionIndex(optionIndex >= 0 ? optionIndex : 0);
  };

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (slashMenu && activeSlashCommand) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (activeSlashOptions.length > 0) {
          setActiveOptionIndex(
            (slashOptionIndex + 1) % activeSlashOptions.length,
          );
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (activeSlashOptions.length > 0) {
          setActiveOptionIndex(
            (slashOptionIndex - 1 + activeSlashOptions.length) %
              activeSlashOptions.length,
          );
        }
        return;
      }
      if (
        slashMenu.commands.length > 1 &&
        (event.key === "ArrowRight" || event.key === "ArrowLeft")
      ) {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        selectSlashCommand(
          (slashCommandIndex + delta + slashMenu.commands.length) %
            slashMenu.commands.length,
        );
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (slashMenu.commands.length > 1) {
          selectSlashCommand(
            (slashCommandIndex + 1) % slashMenu.commands.length,
          );
        } else if (activeSlashOptions.length > 0) {
          applySlashOption(
            activeSlashCommand,
            activeSlashOptions[slashOptionIndex].value,
          );
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (activeSlashOptions.length > 0) {
          applySlashOption(
            activeSlashCommand,
            activeSlashOptions[slashOptionIndex].value,
          );
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleToggleMcp = useCallback(
    (mcp: MCPItem, nextChecked: boolean) => {
      if (nextChecked) {
        dispatch(addSelectedMcp(mcp));
      } else {
        dispatch(removeSelectedMcp(mcp.id));
      }
    },
    [dispatch],
  );

  const handleCopyTechnicalDetail = useCallback(
    async (label: string, value: string) => {
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
    },
    [],
  );

  const handleAskToFixIssues = useCallback(
    (issueIds: string[]) => {
      const selectedRecords = issueIds
        .map((id) => issueRecords.find((record) => record.id === id))
        .filter(Boolean) as typeof issueRecords;

      if (selectedRecords.length === 0) {
        return;
      }

      dispatch(markIssuesSent({ ids: issueIds, roomId }));
      setActiveTab("build");
      dispatch(
        submitAgentMessage({
          message: buildIssuesRepairPrompt(selectedRecords),
          runPixel,
          runPixelAsync,
          getPixelAsyncResult,
          getPixelJobStreaming,
        }),
      );
    },
    [
      dispatch,
      getPixelAsyncResult,
      getPixelJobStreaming,
      issueRecords,
      roomId,
      runPixel,
      runPixelAsync,
    ],
  );

  useEffect(() => {
    if (activeTab === "issues") {
      dispatch(markAllIssuesSeen());
    }
  }, [activeTab, dispatch]);

  useEffect(() => {
    if (!projectId) {
      fetchedSkillsProjectIdRef.current = null;
      setSkillsError(null);
      setIsLoadingSkills(false);
      return;
    }

    if (fetchedSkillsProjectIdRef.current === projectId) {
      return;
    }

    fetchedSkillsProjectIdRef.current = projectId;
    setSkillsError(null);
    setIsLoadingSkills(true);

    void dispatch(querySkills({ projectId, runPixel }))
      .unwrap()
      .catch((error) => {
        console.error("Failed to load skills:", error);
        fetchedSkillsProjectIdRef.current = null;
        setSkillsError("Failed to load skills for this project.");
      })
      .finally(() => {
        setIsLoadingSkills(false);
      });
  }, [dispatch, projectId, runPixel]);

  useEffect(() => {
    setEditedSkillContentByTabId({});
    setSkillSaveError(null);
    setEditingSkillTabId(null);
    setActiveSkillTabId("");
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      loadedSelectedEnginesProjectIdRef.current = null;
      return;
    }
    if (loadedSelectedEnginesProjectIdRef.current === projectId) return;
    loadedSelectedEnginesProjectIdRef.current = projectId;
    void dispatch(loadProjectEngineDependencies({ projectId, runPixel }))
      .unwrap()
      .catch((error) => {
        console.error("Failed to load project engine dependencies:", error);
        loadedSelectedEnginesProjectIdRef.current = null;
      });
  }, [dispatch, projectId, runPixel]);

  // Reset and refetch git history whenever the active project changes.
  useEffect(() => {
    dispatch(clearGitState());
    if (!projectId) return;
    dispatch(
      fetchCommitHistory({
        projectId,
        runPixel,
        offset: 0,
        append: false,
      }),
    );
  }, [dispatch, projectId, runPixel]);

  const fetchEngines = useCallback(
    async (search: string) => {
      setEngineLoading(true);
      try {
        const metaFilters = `[[{"tag":"text-generation"}]]`;
        const pixel = search.trim()
          ? `MyEngines(filterWord=["${search.trim()}"], engineTypes=["MODEL"], metaFilters=[${metaFilters}], limit=[15], offset=[0]);`
          : `MyEngines(engineTypes=["MODEL"], metaFilters=[${metaFilters}], limit=[15], offset=[0]);`;
        const engines = await runPixel<
          Array<{
            engine_id: string;
            engine_display_name: string;
          }>
        >(pixel);
        setEngineResults(
          (engines ?? []).map((e) => ({
            id: e.engine_id,
            label: e.engine_display_name,
          })),
        );
      } catch {
        setEngineResults([]);
      } finally {
        setEngineLoading(false);
      }
    },
    [runPixel],
  );

  useEffect(() => {
    if (!engineDropdownOpen) return;
    const timer = setTimeout(() => {
      void fetchEngines(engineSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [engineSearch, engineDropdownOpen, fetchEngines]);

  useEffect(() => {
    if (!isMcpOpen) return;
    const timer = setTimeout(() => {
      void dispatch(
        callGetUserMcps({
          runPixel,
          filterWord: mcpSearch,
          offset: 0,
          append: false,
        }),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [mcpSearch, isMcpOpen, dispatch, runPixel]);

  useEffect(() => {
    if (!engineId || engineDisplayName) return;
    let cancelled = false;
    (async () => {
      try {
        const engines = await runPixel<
          Array<{ engine_id: string; engine_display_name: string }>
        >(
          `MyEngines(filterWord=["${engineId}"], engineTypes=["MODEL"], limit=[1], offset=[0]);`,
        );
        if (!cancelled && engines?.length) {
          dispatch(setEngineDisplayName(engines[0].engine_display_name));
        }
      } catch {
        // leave display name empty on failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engineId, engineDisplayName, runPixel, dispatch]);

  useEffect(() => {
    resizeChatInput();
  }, [inputMessage, resizeChatInput]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const previousCount = previousMessageCountRef.current;
    const hasNewUserMessage =
      messages.length > previousCount &&
      messages[messages.length - 1]?.role === "user";
    previousMessageCountRef.current = messages.length;

    // A freshly-sent user message always re-pins to the bottom.
    if (hasNewUserMessage) {
      isPinnedToBottomRef.current = true;
    }

    if (!isPinnedToBottomRef.current) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: previousCount === 0 ? "auto" : "smooth",
    });
  }, [messages, transcriptEvents, isStreaming]);

  useEffect(() => {
    const justFinished = wasStreamingRef.current && !isStreaming;
    wasStreamingRef.current = isStreaming;
    if (!justFinished) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.status === "error") {
      toast.error("The agent didn't finish your request.", { duration: 4000 });
      return;
    }

    toast.success("Response complete", { duration: 2000 });
  }, [isStreaming, messages]);

  const orderedMcps = useMemo(() => {
    const pinnedButNotSelected = pinnedMcps.filter(
      (mcp) => !selectedMcpIds.has(mcp.id),
    );
    const pagedItems = availableMcps.filter(
      (mcp) => !selectedMcpIds.has(mcp.id) && !pinnedMcpIds.has(mcp.id),
    );

    return [...selectedMcps, ...pinnedButNotSelected, ...pagedItems];
  }, [availableMcps, pinnedMcps, pinnedMcpIds, selectedMcps, selectedMcpIds]);

  const handleMcpListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!isMcpOpen || isLoadingMcps || !mcpHasMore) {
        return;
      }

      const container = event.currentTarget;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      if (distanceFromBottom > 40) {
        return;
      }

      void dispatch(
        callGetUserMcps({
          runPixel,
          filterWord: mcpSearch,
          offset: mcpOffset,
          append: true,
        }),
      );
    },
    [
      dispatch,
      isLoadingMcps,
      isMcpOpen,
      mcpHasMore,
      mcpOffset,
      mcpSearch,
      runPixel,
    ],
  );

  const skillTabs = useMemo<SkillTab[]>(() => {
    const tabs: SkillTab[] = [];

    if (claudeMd?.content) {
      tabs.push({
        id: "claude-md",
        label: claudeMd.name || "CLAUDE.md",
        skillName: claudeMd.name || "CLAUDE.md",
        content: claudeMd.content,
      });
    }

    for (let index = 0; index < skills.length; index += 1) {
      const skill = skills[index];
      if (!skill.content) {
        continue;
      }
      tabs.push({
        id: `${skill.name || "skill"}-${index}`,
        label: skill.name || `Skill ${index + 1}`,
        skillName: skill.name || `Skill ${index + 1}`,
        content: skill.content,
      });
    }

    return tabs;
  }, [claudeMd, skills]);
  const hasSkillsContent = skillTabs.length > 0;
  const activeSkillTab =
    skillTabs.find((tab) => tab.id === activeSkillTabId) ??
    skillTabs[0] ??
    null;
  const activeSkillContent = activeSkillTab
    ? (editedSkillContentByTabId[activeSkillTab.id] ?? activeSkillTab.content)
    : "";
  const isActiveSkillEditing =
    Boolean(activeSkillTab) && editingSkillTabId === activeSkillTab?.id;
  const isActiveSkillDirty = Boolean(
    activeSkillTab && activeSkillContent !== activeSkillTab.content,
  );

  useEffect(() => {
    if (!isSkillsOpen) {
      return;
    }

    if (skillTabs.length === 0) {
      setActiveSkillTabId("");
      return;
    }

    if (!skillTabs.some((tab) => tab.id === activeSkillTabId)) {
      setActiveSkillTabId(skillTabs[0].id);
    }
  }, [activeSkillTabId, isSkillsOpen, skillTabs]);

  useEffect(() => {
    if (!editingSkillTabId) {
      return;
    }

    if (!skillTabs.some((tab) => tab.id === editingSkillTabId)) {
      setEditingSkillTabId(null);
      setSkillSaveError(null);
    }
  }, [editingSkillTabId, skillTabs]);

  useEffect(() => {
    setEditedSkillContentByTabId((previous) => {
      if (Object.keys(previous).length === 0) {
        return previous;
      }

      const validIds = new Set(skillTabs.map((tab) => tab.id));
      const nextDrafts: Record<string, string> = {};
      let hasRemovedEntry = false;

      for (const [tabId, content] of Object.entries(previous)) {
        if (validIds.has(tabId)) {
          nextDrafts[tabId] = content;
          continue;
        }
        hasRemovedEntry = true;
      }

      return hasRemovedEntry ? nextDrafts : previous;
    });
  }, [skillTabs]);

  const handleSaveSkill = useCallback(async () => {
    if (
      !activeSkillTab ||
      !projectId ||
      isSavingSkill ||
      !isActiveSkillEditing
    ) {
      return;
    }

    const tabId = activeSkillTab.id;
    const skillName = activeSkillTab.skillName;
    const skillContent =
      editedSkillContentByTabId[tabId] ?? activeSkillTab.content;

    if (skillContent === activeSkillTab.content) {
      return;
    }

    setSkillSaveError(null);
    setIsSavingSkill(true);

    try {
      const response = await dispatch(
        updateSkill({
          projectId,
          skillName,
          skillContent,
          runPixel,
        }),
      ).unwrap();

      if (!response.result) {
        setSkillSaveError("Failed to update this skill.");
        return;
      }

      setEditedSkillContentByTabId((previous) => {
        if (!(tabId in previous)) {
          return previous;
        }
        const nextDrafts = { ...previous };
        delete nextDrafts[tabId];
        return nextDrafts;
      });
      setEditingSkillTabId(null);
      setSkillSaveError(null);
    } catch (error) {
      console.error("Failed to update skill:", error);
      setSkillSaveError("Failed to update this skill.");
    } finally {
      setIsSavingSkill(false);
    }
  }, [
    activeSkillTab,
    dispatch,
    editedSkillContentByTabId,
    isActiveSkillEditing,
    isSavingSkill,
    projectId,
    runPixel,
  ]);

  const handleStartSkillEdit = useCallback(() => {
    if (!activeSkillTab) {
      return;
    }

    setEditedSkillContentByTabId((previous) => ({
      ...previous,
      [activeSkillTab.id]:
        previous[activeSkillTab.id] ?? activeSkillTab.content,
    }));
    setEditingSkillTabId(activeSkillTab.id);
    setSkillSaveError(null);
  }, [activeSkillTab]);

  const handleCancelSkillEdit = useCallback(() => {
    if (!activeSkillTab) {
      return;
    }

    setEditedSkillContentByTabId((previous) => {
      if (!(activeSkillTab.id in previous)) {
        return previous;
      }
      const nextDrafts = { ...previous };
      delete nextDrafts[activeSkillTab.id];
      return nextDrafts;
    });
    setEditingSkillTabId(null);
    setSkillSaveError(null);
  }, [activeSkillTab]);

  const handleDeleteSkill = useCallback(async () => {
    if (!activeSkillTab || !projectId || isDeletingSkill) {
      return;
    }

    if (activeSkillTab.id === "claude-md") {
      return;
    }

    setIsDeletingSkill(true);
    try {
      const response = await dispatch(
        deleteSkill({
          projectId,
          skillName: activeSkillTab.skillName,
          runPixel,
        }),
      ).unwrap();

      if (!response.result) {
        setSkillSaveError("Failed to delete this skill.");
        return;
      }

      setEditingSkillTabId(null);
      setSkillSaveError(null);
      setEditedSkillContentByTabId((previous) => {
        if (!(activeSkillTab.id in previous)) {
          return previous;
        }
        const nextDrafts = { ...previous };
        delete nextDrafts[activeSkillTab.id];
        return nextDrafts;
      });
    } catch (error) {
      console.error("Failed to delete skill:", error);
      setSkillSaveError("Failed to delete this skill.");
    } finally {
      setIsDeletingSkill(false);
    }
  }, [activeSkillTab, dispatch, isDeletingSkill, projectId, runPixel]);

  const handleCreateSkill = useCallback(async () => {
    const trimmedName = newSkillName.trim();
    const trimmedContent = newSkillContent.trim();

    if (!trimmedName || !trimmedContent || !projectId || isCreatingSkill) {
      return;
    }

    setCreateSkillError(null);
    setIsCreatingSkill(true);

    try {
      const response = await dispatch(
        createSkill({
          projectId,
          skillName: trimmedName,
          skillContent: trimmedContent,
          runPixel,
        }),
      ).unwrap();

      if (!response.result) {
        setCreateSkillError("Failed to create skill.");
        return;
      }

      setNewSkillName("");
      setNewSkillContent("");
      setIsCreateSkillOpen(false);
      setCreateSkillError(null);
    } catch (error) {
      console.error("Failed to create skill:", error);
      setCreateSkillError("Failed to create skill.");
    } finally {
      setIsCreatingSkill(false);
    }
  }, [
    dispatch,
    isCreatingSkill,
    newSkillContent,
    newSkillName,
    projectId,
    runPixel,
  ]);

  return (
    <>
      <div className="relative h-full min-h-[32rem] overflow-hidden rounded-2xl border border-slate-200/60 dark:border-white/10 bg-gradient-to-br from-slate-50/90 via-white/80 to-sky-50/50 dark:from-zinc-900/80 dark:via-zinc-800/60 dark:to-zinc-900/80 p-6 shadow-xl shadow-slate-400/10 dark:shadow-black/20 backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-gradient-to-br from-slate-300/40 to-sky-200/30 dark:from-slate-500/15 dark:to-sky-500/10 blur-3xl animate-pulse-soft" />
        <div
          className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-gradient-to-tr from-sky-200/35 to-slate-200/25 dark:from-sky-500/10 dark:to-slate-500/8 blur-3xl animate-pulse-soft"
          style={{ animationDelay: "1.25s" }}
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(
              value as "build" | "issues" | "engines" | "history" | "settings",
            )
          }
          className="relative flex h-full flex-col"
        >
          <header className="flex flex-col gap-2 rounded-t-xl border border-slate-200/50 dark:border-white/10 bg-gradient-to-r from-slate-50/60 via-white/40 to-sky-50/30 px-4 py-3">
            <div className="relative flex items-center justify-center">
              <div className="absolute left-0 top-1/2 -translate-y-1/2">
                <ConversationHistoryPanel />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] font-medium text-slate-500 dark:text-slate-400">
                Build Your App
              </p>
              <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => dispatch(startNewRoom())}
                  title="New Chat"
                >
                  <SquarePen className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <TabsList>
                <TabsTrigger value="build">Build</TabsTrigger>
                <TabsTrigger value="issues" className="gap-2">
                  Issues
                  {unseenIssuesCount > 0 ? (
                    <Badge
                      variant="destructive"
                      className="rounded-full px-1.5 py-0 text-[10px]"
                    >
                      {unseenIssuesCount}
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="engines">Engines</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="settings">Agent</TabsTrigger>
              </TabsList>
            </div>
          </header>

          <TabsContent
            value="build"
            className="mt-0 flex flex-1 min-h-0 flex-col rounded-b-xl border border-t-0 border-slate-200/50 dark:border-white/10 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-xl shadow-lg shadow-slate-400/5"
          >
            <div
              ref={messagesContainerRef}
              className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-5"
            >
              {messages.length === 0 && transcriptEvents.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
                    <Sparkles className="h-8 w-8 text-emerald-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold tracking-tight">
                      Describe what you want to build
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Share a workflow, paste requirements, or ask for changes
                      in plain language.
                    </p>
                    <div className="pt-2 text-xs text-muted-foreground">
                      Examples: "Create an intake app for internal requests" or
                      "Turn this spreadsheet into a dashboard."
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {timeline.map((item) =>
                    item.source === "message" ? (
                      <MessageBubble key={item.key} {...item.message} />
                    ) : (
                      <TranscriptEventBubble
                        key={item.key}
                        event={item.event}
                      />
                    ),
                  )}
                  {isStreaming ? (
                    <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      <span>{activeHarnessLabel} is working...</span>
                    </div>
                  ) : (
                    <LatestCommitChip
                      onOpenHistory={() => setActiveTab("history")}
                    />
                  )}
                </>
              )}
            </div>

            <footer className="border-t border-slate-200/50 dark:border-white/10 bg-gradient-to-r from-white/60 to-slate-50/40 px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="relative flex-1">
                  {slashMenu && activeSlashCommand ? (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md overflow-hidden rounded-xl border border-slate-200/70 bg-white/95 shadow-xl shadow-slate-400/20 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95">
                      <div className="flex max-h-72">
                        <div className="w-32 shrink-0 space-y-0.5 overflow-y-auto border-r border-slate-200/60 bg-slate-50/70 p-1.5 dark:border-white/10 dark:bg-zinc-800/40">
                          {slashMenu.commands.map((command, index) => {
                            const isActive = index === slashCommandIndex;
                            return (
                              <button
                                key={command.name}
                                type="button"
                                onMouseEnter={() => selectSlashCommand(index)}
                                onClick={() => selectSlashCommand(index)}
                                className={cn(
                                  "flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left transition-colors",
                                  isActive
                                    ? "bg-white shadow-sm dark:bg-zinc-700/70"
                                    : "hover:bg-white/70 dark:hover:bg-zinc-700/40",
                                )}
                              >
                                <span className="text-sm font-medium">
                                  {command.label}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {command.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
                          <p className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {activeSlashCommand.description}
                          </p>
                          {activeSlashOptions.map((option, index) => {
                            const isActive = index === slashOptionIndex;
                            const isCurrent =
                              currentSlashValue(
                                activeSlashCommand,
                                effort,
                                thinkingEnabled,
                              ) === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onMouseEnter={() => setActiveOptionIndex(index)}
                                onClick={() =>
                                  applySlashOption(activeSlashCommand, option.value)
                                }
                                className={cn(
                                  "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                                  isActive
                                    ? "bg-emerald-500/10 text-foreground"
                                    : "hover:bg-accent/50",
                                )}
                              >
                                <span className="flex min-w-0 flex-col">
                                  <span className="text-sm font-medium">
                                    {option.label}
                                  </span>
                                  <span className="truncate text-[11px] text-muted-foreground">
                                    {option.description}
                                  </span>
                                </span>
                                {isCurrent ? (
                                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                    current
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 border-t border-slate-200/60 bg-slate-50/50 px-3 py-1.5 text-[10px] text-muted-foreground dark:border-white/10 dark:bg-zinc-800/30">
                        <span>↑↓ options</span>
                        {slashMenu.commands.length > 1 ? (
                          <span>←→ switch</span>
                        ) : null}
                        <span>↵ apply</span>
                        <span>esc dismiss</span>
                      </div>
                    </div>
                  ) : null}
                  <Textarea
                    placeholder="Type a message…  (/ for commands)"
                    rows={2}
                    ref={chatInputRef}
                    value={inputMessage}
                    onChange={handleMessageChange}
                    onKeyDown={handleMessageKeyDown}
                    onSelect={handleInputSelect}
                    className="min-h-[3.25rem] max-h-60 w-full resize-none border-slate-200/60 bg-white/90 dark:bg-zinc-800/70 focus-visible:ring-slate-400/30"
                  />
                </div>
                <Button
                  disabled={isSendDisabled}
                  onClick={handleSendMessage}
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/30 disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-zinc-700"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </footer>
          </TabsContent>

          <TabsContent value="issues" className="mt-0 flex flex-1 min-h-0">
            <IssuesPanel onAskToFix={handleAskToFixIssues} />
          </TabsContent>

          <TabsContent
            value="engines"
            className="mt-0 flex-1 min-h-0 overflow-y-auto rounded-b-xl border border-t-0 border-slate-200/50 dark:border-white/10 bg-gradient-to-b from-white/90 via-slate-50/40 to-sky-50/20 dark:from-zinc-900/80 dark:via-zinc-800/60 dark:to-zinc-900/60 p-4 shadow-lg shadow-slate-400/5 dark:shadow-black/20 backdrop-blur-xl"
          >
            <EnginesPanel />
          </TabsContent>

          <TabsContent value="history" className="mt-0 flex flex-1 min-h-0">
            <HistoryPanel />
          </TabsContent>

          <TabsContent
            value="settings"
            className="mt-0 flex-1 min-h-0 overflow-y-auto rounded-b-xl border border-t-0 border-slate-200/50 dark:border-white/10 bg-gradient-to-b from-white/90 via-slate-50/40 to-sky-50/20 dark:from-zinc-900/80 dark:via-zinc-800/60 dark:to-zinc-900/60 p-4 shadow-lg shadow-slate-400/5 dark:shadow-black/20 backdrop-blur-xl"
          >
            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] font-medium text-slate-500 dark:text-slate-400">
                  Agent
                </p>
                <h2 className="text-lg font-semibold">Agent settings</h2>
                <p className="text-sm text-muted-foreground">
                  Pick an agent, choose its assistant + model, and configure
                  lifecycle hooks. Switching agents reloads its hook list and
                  workspace config.
                </p>
              </div>

              <AgentPicker />

              <div className="space-y-2">
                <Label>Assistant</Label>
                <div className="flex rounded-md border">
                  {HARNESS_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        if (option.value === harnessType) return;
                        if (
                          messages.length > 0 ||
                          transcriptEvents.length > 0
                        ) {
                          setPendingHarnessType(option.value);
                        } else {
                          dispatch(setHarnessType(option.value));
                        }
                      }}
                      className={cn(
                        "flex-1 px-3 py-1.5 text-sm font-medium transition-colors",
                        "first:rounded-l-md last:rounded-r-md",
                        harnessType === option.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent text-muted-foreground hover:bg-accent/60",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                <Popover
                  open={engineDropdownOpen}
                  onOpenChange={(open) => {
                    setEngineDropdownOpen(open);
                    if (!open) setEngineSearch("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate text-left">
                        {engineDisplayName ||
                          (engineId
                            ? `${engineId.slice(0, 18)}...`
                            : "Select model")}
                      </span>
                      <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[260px] p-2" align="start">
                    <Input
                      placeholder="Search models..."
                      value={engineSearch}
                      onChange={(e) => setEngineSearch(e.target.value)}
                      className="mb-2 h-8 text-sm"
                      autoFocus
                    />
                    {engineLoading ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        Loading...
                      </div>
                    ) : engineResults.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        No models found.
                      </div>
                    ) : (
                      <div className="max-h-52 overflow-y-auto">
                        {engineResults.map((engine) => (
                          <button
                            key={engine.id}
                            type="button"
                            onClick={() => {
                              dispatch(setEngineId(engine.id));
                              dispatch(setEngineDisplayName(engine.label));
                              setEngineDropdownOpen(false);
                              setEngineSearch("");
                            }}
                            className={cn(
                              "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60",
                              engineId === engine.id && "bg-accent/80",
                            )}
                          >
                            <span className="font-medium leading-snug">
                              {engine.label}
                            </span>
                            <span className="w-full truncate font-mono text-xs text-muted-foreground">
                              {engine.id}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="rounded-xl border border-slate-200/60 bg-white/70 p-4 dark:border-white/10 dark:bg-zinc-900/30">
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen((value) => !value)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold">Advanced</p>
                    <p className="text-xs text-muted-foreground">
                      Technical controls, workspace tools, and copyable IDs.
                    </p>
                  </div>
                  {isAdvancedOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>

              {isAdvancedOpen ? (
                <>
                  <div className="space-y-2">
                    <Dialog
                      open={isConfigurationOpen}
                      onOpenChange={setIsConfigurationOpen}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2"
                        >
                          <Settings className="h-4 w-4" />
                          Configuration
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Configuration</DialogTitle>
                          <DialogDescription>
                            Configure permission mode and workspace binding for
                            this chat.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="permission-mode">
                              Permission Mode
                            </Label>
                            <Select
                              value={permissionMode}
                              onValueChange={(value) => {
                                if (isPermissionMode(value)) {
                                  dispatch(setPermissionMode(value));
                                }
                              }}
                            >
                              <SelectTrigger id="permission-mode">
                                <SelectValue placeholder="Select permission mode" />
                              </SelectTrigger>
                              <SelectContent>
                                {PERMISSION_MODE_OPTIONS.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="workspace-id">Workspace ID</Label>
                            <Input
                              id="workspace-id"
                              value={workspaceId}
                              placeholder="e.g. 228b439d-3d68-4d22-aaa0-10252c39045d"
                              onChange={(event) =>
                                dispatch(
                                  setWorkspaceId(event.target.value.trim()),
                                )
                              }
                            />
                            <p className="text-xs text-muted-foreground">
                              Optional. When set, drives the agent's server-side
                              config (subdir, hooks, MCPs, system prompt) from
                              WORKSPACE.CONFIG_JSON. Leave blank for legacy
                              behavior.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="max-turns">Max Turns</Label>
                            <Input
                              id="max-turns"
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={maxTurnsDraft}
                              onChange={(event) =>
                                setMaxTurnsDraft(event.target.value)
                              }
                              onBlur={commitMaxTurns}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  commitMaxTurns();
                                  event.currentTarget.blur();
                                }
                              }}
                            />
                            <p className="text-xs text-muted-foreground">
                              Maximum number of agent turns per message.
                              Defaults to {DEFAULT_MAX_TURNS}.
                            </p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsConfigurationOpen(false)}
                          >
                            Close
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog
                      open={isMcpOpen}
                      onOpenChange={(open) => {
                        setIsMcpOpen(open);
                        if (!open) {
                          dispatch(resetMcpPickerState());
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2"
                        >
                          <Search className="h-4 w-4" />
                          MCPs
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>MCPs</DialogTitle>
                          <DialogDescription>
                            Search and select the MCPs available to this
                            workspace.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <Input
                            placeholder="Search MCPs..."
                            value={mcpSearch}
                            onChange={(event) =>
                              dispatch(setMcpSearch(event.target.value))
                            }
                            className="h-8 text-sm"
                            autoFocus
                          />
                          {orderedMcps.length === 0 && !isLoadingMcps ? (
                            <p className="text-xs text-muted-foreground">
                              {mcpSearch
                                ? "No MCPs match your search."
                                : "No MCPs available for this workspace yet."}
                            </p>
                          ) : (
                            <div
                              className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-white/70 dark:bg-zinc-800/50 p-2"
                              onScroll={handleMcpListScroll}
                            >
                              {orderedMcps.map((mcp) => {
                                const isSelected = selectedMcpIds.has(mcp.id);
                                return (
                                  <label
                                    key={mcp.id}
                                    className={cn(
                                      "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition hover:bg-accent/40",
                                      isSelected && "bg-accent/60",
                                    )}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) =>
                                        handleToggleMcp(mcp, checked === true)
                                      }
                                    />
                                    <div className="min-w-0">
                                      <span className="block truncate">
                                        {mcp.name}
                                      </span>
                                      <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                                        {mcp.type}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })}
                              {isLoadingMcps ? (
                                <div className="px-2 py-1 text-xs text-muted-foreground">
                                  Loading MCPs...
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsMcpOpen(false)}
                          >
                            Close
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={isSkillsOpen} onOpenChange={setIsSkillsOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2"
                          disabled={!projectId}
                        >
                          <BookOpen className="h-4 w-4" />
                          View Skills
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="flex h-[78vh] w-[92vw] max-w-5xl flex-col">
                        <DialogHeader>
                          <DialogTitle>Project Skills</DialogTitle>
                          <DialogDescription></DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-1">
                          {isLoadingSkills ? (
                            <p className="text-sm text-muted-foreground">
                              Loading skills...
                            </p>
                          ) : skillsError ? (
                            <p className="text-sm text-destructive">
                              {skillsError}
                            </p>
                          ) : !hasSkillsContent ? (
                            <div className="space-y-4">
                              <p className="text-sm text-muted-foreground">
                                No skills found for this project.
                              </p>
                              <Dialog
                                open={isCreateSkillOpen}
                                onOpenChange={(nextOpen) => {
                                  if (!isCreatingSkill) {
                                    setIsCreateSkillOpen(nextOpen);
                                    if (!nextOpen) {
                                      setCreateSkillError(null);
                                    }
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button size="sm" className="gap-1">
                                    <Plus className="h-3.5 w-3.5" />
                                    Create Skill
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Create Skill</DialogTitle>
                                    <DialogDescription>
                                      Add a new skill to this project.
                                    </DialogDescription>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <div className="space-y-2">
                                      <Label htmlFor="new-skill-name-empty">
                                        Skill Name
                                      </Label>
                                      <Input
                                        id="new-skill-name-empty"
                                        placeholder="my-skill.md"
                                        value={newSkillName}
                                        onChange={(event) => {
                                          setNewSkillName(event.target.value);
                                          setCreateSkillError(null);
                                        }}
                                        autoFocus
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor="new-skill-content-empty">
                                        Content
                                      </Label>
                                      <Textarea
                                        id="new-skill-content-empty"
                                        rows={8}
                                        placeholder="Skill content..."
                                        value={newSkillContent}
                                        onChange={(event) => {
                                          setNewSkillContent(
                                            event.target.value,
                                          );
                                          setCreateSkillError(null);
                                        }}
                                        className="font-mono text-xs"
                                      />
                                    </div>
                                    {createSkillError ? (
                                      <p className="text-sm text-destructive">
                                        {createSkillError}
                                      </p>
                                    ) : null}
                                  </div>
                                  <DialogFooter>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() =>
                                        setIsCreateSkillOpen(false)
                                      }
                                      disabled={isCreatingSkill}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      type="button"
                                      onClick={handleCreateSkill}
                                      disabled={
                                        !newSkillName.trim() ||
                                        !newSkillContent.trim() ||
                                        isCreatingSkill
                                      }
                                    >
                                      {isCreatingSkill
                                        ? "Creating..."
                                        : "Create"}
                                    </Button>
                                  </DialogFooter>
                                </DialogContent>
                              </Dialog>
                            </div>
                          ) : (
                            <div className="flex h-full min-h-0 flex-col space-y-3">
                              <div className="flex items-center gap-2">
                                <div className="overflow-x-auto flex-1">
                                  <div className="inline-flex min-w-full gap-2 rounded-lg border border-border/60 bg-muted/30 p-1">
                                    {skillTabs.map((tab) => {
                                      const isActive =
                                        tab.id === activeSkillTab?.id;
                                      return (
                                        <button
                                          key={tab.id}
                                          type="button"
                                          onClick={() => {
                                            setActiveSkillTabId(tab.id);
                                            setEditingSkillTabId(null);
                                            setSkillSaveError(null);
                                          }}
                                          className={cn(
                                            "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition",
                                            isActive
                                              ? "bg-white text-foreground shadow-sm"
                                              : "text-muted-foreground hover:bg-white/70 hover:text-foreground",
                                          )}
                                        >
                                          {tab.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                <Dialog
                                  open={isCreateSkillOpen}
                                  onOpenChange={(nextOpen) => {
                                    if (!isCreatingSkill) {
                                      setIsCreateSkillOpen(nextOpen);
                                      if (!nextOpen) {
                                        setCreateSkillError(null);
                                      }
                                    }
                                  }}
                                >
                                  <DialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 shrink-0"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      New Skill
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Create Skill</DialogTitle>
                                      <DialogDescription>
                                        Add a new skill to this project.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                      <div className="space-y-2">
                                        <Label htmlFor="new-skill-name">
                                          Skill Name
                                        </Label>
                                        <Input
                                          id="new-skill-name"
                                          placeholder="my-skill.md"
                                          value={newSkillName}
                                          onChange={(event) => {
                                            setNewSkillName(event.target.value);
                                            setCreateSkillError(null);
                                          }}
                                          autoFocus
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor="new-skill-content">
                                          Content
                                        </Label>
                                        <Textarea
                                          id="new-skill-content"
                                          rows={8}
                                          placeholder="Skill content..."
                                          value={newSkillContent}
                                          onChange={(event) => {
                                            setNewSkillContent(
                                              event.target.value,
                                            );
                                            setCreateSkillError(null);
                                          }}
                                          className="font-mono text-xs"
                                        />
                                      </div>
                                      {createSkillError ? (
                                        <p className="text-sm text-destructive">
                                          {createSkillError}
                                        </p>
                                      ) : null}
                                    </div>
                                    <DialogFooter>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                          setIsCreateSkillOpen(false)
                                        }
                                        disabled={isCreatingSkill}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        onClick={handleCreateSkill}
                                        disabled={
                                          !newSkillName.trim() ||
                                          !newSkillContent.trim() ||
                                          isCreatingSkill
                                        }
                                      >
                                        {isCreatingSkill
                                          ? "Creating..."
                                          : "Create"}
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>
                              </div>
                              <section className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border/60 bg-white/70 dark:bg-zinc-800/50 p-3">
                                {activeSkillTab ? (
                                  <div className="flex h-full min-h-0 flex-col gap-3">
                                    <div className="flex items-center justify-between gap-2">
                                      {isActiveSkillEditing ? (
                                        <>
                                          <p className="text-xs text-muted-foreground">
                                            Edit and save this skill tab.
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              onClick={handleCancelSkillEdit}
                                              disabled={isSavingSkill}
                                            >
                                              Cancel
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              onClick={handleSaveSkill}
                                              disabled={
                                                !isActiveSkillDirty ||
                                                isSavingSkill
                                              }
                                            >
                                              {isSavingSkill
                                                ? "Saving..."
                                                : "Save"}
                                            </Button>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-xs text-muted-foreground">
                                            View this skill tab.
                                          </p>
                                          <div className="flex items-center gap-2">
                                            {activeSkillTab.id !==
                                            "claude-md" ? (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                onClick={handleDeleteSkill}
                                                disabled={isDeletingSkill}
                                                className="gap-1"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                                {isDeletingSkill
                                                  ? "Deleting..."
                                                  : "Delete"}
                                              </Button>
                                            ) : null}
                                            <Button
                                              type="button"
                                              size="sm"
                                              onClick={handleStartSkillEdit}
                                            >
                                              Edit
                                            </Button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    {isActiveSkillEditing ? (
                                      <>
                                        <Textarea
                                          value={activeSkillContent}
                                          onChange={(event) => {
                                            setEditedSkillContentByTabId(
                                              (previous) => ({
                                                ...previous,
                                                [activeSkillTab.id]:
                                                  event.target.value,
                                              }),
                                            );
                                            setSkillSaveError(null);
                                          }}
                                          className="min-h-[14rem] flex-1 resize-none font-mono text-xs"
                                        />
                                        {skillSaveError ? (
                                          <p className="text-sm text-destructive">
                                            {skillSaveError}
                                          </p>
                                        ) : null}
                                        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-white/80 dark:bg-zinc-800/60 p-3">
                                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                            Preview
                                          </p>
                                          <MarkdownRenderer
                                            content={activeSkillContent}
                                            className="text-sm text-foreground"
                                          />
                                        </div>
                                      </>
                                    ) : (
                                      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/50 bg-white/80 dark:bg-zinc-800/60 p-3">
                                        <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                          Content
                                        </p>
                                        <MarkdownRenderer
                                          content={activeSkillTab.content}
                                          className="text-sm text-foreground"
                                        />
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    No skill selected.
                                  </p>
                                )}
                              </section>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsSkillsOpen(false)}
                          >
                            Close
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-3 rounded-xl border border-slate-200/60 bg-white/70 p-4 dark:border-white/10 dark:bg-zinc-900/30">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Technical details</p>
                      <p className="text-xs text-muted-foreground">
                        Internal workspace values are available here when you
                        need them.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-slate-200/60 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-zinc-900/40">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Room ID
                        </p>
                        <p className="mt-1 break-all font-mono text-xs">
                          {roomId || "Unavailable"}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 gap-2 px-0"
                          disabled={!roomId}
                          onClick={() =>
                            handleCopyTechnicalDetail("Room ID", roomId)
                          }
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                      </div>

                      <div className="rounded-lg border border-slate-200/60 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-zinc-900/40">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Project ID
                        </p>
                        <p className="mt-1 break-all font-mono text-xs">
                          {projectId || "Unavailable"}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 gap-2 px-0"
                          disabled={!projectId}
                          onClick={() =>
                            handleCopyTechnicalDetail("Project ID", projectId)
                          }
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              {/* Hooks section — formerly a top-level tab; now lives as
                  the bottom section of Agent settings so users see the
                  workspace's hook list alongside its other config. */}
              <div className="-mx-4 border-t border-slate-200/50 dark:border-white/10">
                <HooksPanel />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmationDialog
        open={pendingHarnessType !== null}
        title="Switch assistant?"
        text="Switching the assistant will create a new chat. Your current conversation will be lost. Do you want to continue?"
        buttons={
          <>
            <Button
              variant="outline"
              onClick={() => setPendingHarnessType(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingHarnessType) {
                  dispatch(setHarnessType(pendingHarnessType));
                  dispatch(startNewRoom());
                }
                setPendingHarnessType(null);
              }}
            >
              Continue
            </Button>
          </>
        }
      />
    </>
  );
};
