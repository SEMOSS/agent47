import {
  Activity,
  ArrowUp,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Copy,
  Brain,
  FileSearch,
  Image as ImageIcon,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  SquarePen,
  Terminal,
  Trash2,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ClipboardEvent,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
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
import {
  getTranscriptEventStableKey,
  type TranscriptEvent,
} from "@/types/transcript";

type SkillTab = {
  id: string;
  label: string;
  skillName: string;
  content: string;
};

type InspectorTab = "activity" | "issues" | "engines" | "history" | "settings";
type ActivityGroupName =
  | "Goal"
  | "Thinking"
  | "Reading"
  | "Editing"
  | "Checks"
  | "Issues"
  | "Complete"
  | "Other";

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
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

type PendingImageAttachment = {
  id: string;
  name: string;
  size: number;
  dataUri: string;
};

type QueuedChatMessage = {
  id: string;
  content: string;
  attachments: PendingImageAttachment[];
  createdAt: number;
};

const createAttachmentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const createQueuedMessageId = () => `queued-${createAttachmentId()}`;

const formatAttachmentSize = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const QUEUE_DRAIN_DELAY_MS = 500;

const getQueuedMessagePreview = (message: QueuedChatMessage) => {
  const content = message.content.trim();
  if (content) return content;
  return message.attachments.length === 1
    ? "Image prompt"
    : `${message.attachments.length} image prompts`;
};

const readImageAttachment = (file: File) =>
  new Promise<PendingImageAttachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read image."));
        return;
      }
      resolve({
        id: createAttachmentId(),
        name: file.name || "image",
        size: file.size,
        dataUri: reader.result,
      });
    };
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });

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

const TOOL_ENGINE_PREFIX_RE =
  /^a?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_+/i;
const INSPECTOR_DEFAULT_WIDTH = 416;
const INSPECTOR_MIN_WIDTH = 320;
const INSPECTOR_MAX_WIDTH = 760;
const INSPECTOR_WIDTH_STORAGE_KEY = "agent47:inspectorWidth";

const clampInspectorWidth = (value: number, viewportWidth?: number) => {
  const viewport =
    viewportWidth ??
    (typeof window !== "undefined" ? window.innerWidth : INSPECTOR_MAX_WIDTH);
  const reservedMainWidth = viewport >= 1024 ? 420 : 280;
  const viewportMax = Math.max(
    INSPECTOR_MIN_WIDTH,
    Math.min(INSPECTOR_MAX_WIDTH, viewport - reservedMainWidth),
  );
  return Math.min(Math.max(value, INSPECTOR_MIN_WIDTH), viewportMax);
};

const readStoredInspectorWidth = () => {
  if (typeof window === "undefined") {
    return INSPECTOR_DEFAULT_WIDTH;
  }

  try {
    const stored = Number.parseInt(
      window.localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY) ?? "",
      10,
    );
    return Number.isFinite(stored)
      ? clampInspectorWidth(stored)
      : INSPECTOR_DEFAULT_WIDTH;
  } catch {
    return INSPECTOR_DEFAULT_WIDTH;
  }
};

const formatTimestamp = (timestamp?: string) => {
  if (!timestamp) return "";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const stripToolEnginePrefix = (toolName?: string) =>
  (toolName ?? "").trim().replace(TOOL_ENGINE_PREFIX_RE, "");

const toTitleCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getToolDisplayName = (toolName?: string) => {
  const normalized = stripToolEnginePrefix(toolName);
  return normalized ? toTitleCase(normalized) : "Tool";
};

const getToolKey = (toolName?: string) =>
  stripToolEnginePrefix(toolName)
    .replace(/[\s_-]+/g, "")
    .toLowerCase();

const getRecordValue = (
  record: Record<string, unknown> | undefined,
  keys: string[],
) => {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
};

const stringifyToolValue = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatLineRange = (args?: Record<string, unknown>) => {
  const offsetValue = getRecordValue(args, ["offset", "start", "line"]);
  const limitValue = getRecordValue(args, ["limit"]);
  const offset = Number(offsetValue);
  const limit = Number(limitValue);

  if (!Number.isFinite(offset) || offset <= 0) {
    return "";
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    return `line ${offset}`;
  }
  return `lines ${offset}-${offset + limit - 1}`;
};

const summarizeArgs = (args?: Record<string, unknown>) => {
  if (!args) return "";
  const parts: string[] = [];
  const filePath = getRecordValue(args, ["file_path", "filePath", "path"]);
  const project = getRecordValue(args, ["project", "projectId"]);
  const query = getRecordValue(args, ["query", "pattern", "search", "glob"]);
  const command = getRecordValue(args, ["command"]);
  const lineRange = formatLineRange(args);

  if (filePath) parts.push(stringifyToolValue(filePath));
  if (lineRange) parts.push(lineRange);
  if (project) parts.push(`project ${stringifyToolValue(project)}`);
  if (query) parts.push(stringifyToolValue(query));
  if (command && !filePath) parts.push(stringifyToolValue(command));

  if (parts.length > 0) {
    return parts.map((part) => summarizeText(part, 120)).join(" - ");
  }

  return Object.entries(args)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${summarizeText(stringifyToolValue(value), 80)}`)
    .join(" - ");
};

const summarizeText = (value: string, limit = 180) => {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit - 3)}...`;
};

const stripReadLineNumbers = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\s+/, "").trimEnd())
    .join("\n");

const summarizeDirectoryOutput = (value: string) => {
  const entries = value
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(DIR|FILE)\s+\S+\s+\S+\s+(?:\d+\s+)?(.+)$/);
      if (!match) return "";
      return match[1] === "DIR" ? `${match[2]}/` : match[2];
    })
    .filter(Boolean);

  if (entries.length === 0) return "";
  const visible = entries.slice(0, 6).join(", ");
  return entries.length > 6 ? `${visible}, ...` : visible;
};

const summarizeToolOutput = (value?: string, limit = 180) => {
  if (!value) return "";
  const directorySummary = summarizeDirectoryOutput(value);
  if (directorySummary) {
    return summarizeText(directorySummary, limit);
  }
  return summarizeText(stripReadLineNumbers(value), limit);
};

type RawDetailBlock = {
  label?: string;
  value: string;
  variant?: "code" | "text";
};

const prettyPrintRecord = (value?: Record<string, unknown>) => {
  if (!value || Object.keys(value).length === 0) return "";
  return JSON.stringify(value, null, 2);
};

const getVisibleStatus = (status?: string) => {
  if (!status) return "";
  const normalized = status.toLowerCase();
  if (["success", "completed", "complete"].includes(normalized)) {
    return "";
  }
  if (normalized === "streaming") return "running";
  return status;
};

const cleanActivityTitle = (value: string) =>
  value
    .replace(
      /^(Goal|Thinking|Planning|Reading|Editing|Checks|Issues|Complete|Other):\s*/i,
      "",
    )
    .trim();

const stripMarkdownEmphasis = (value: string) =>
  value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

const cleanThinkingDetail = (value: string) =>
  stripMarkdownEmphasis(value)
    .replace(/^I['’]m thinking(?:\s+that)?\s+/i, "")
    .replace(/^Thinking(?:\s+that)?\s+/i, "")
    .trim();

const getAssistantThoughtParts = (text: string) => {
  const trimmed = text.trim();
  const headingMatch = trimmed.match(/^\*\*([^*]+)\*\*\s*(.*)$/s);

  if (headingMatch) {
    return {
      title: cleanActivityTitle(stripMarkdownEmphasis(headingMatch[1])),
      detail: cleanThinkingDetail(headingMatch[2]),
    };
  }

  return {
    title: "Thinking",
    detail: cleanThinkingDetail(trimmed),
  };
};

const getAssistantThoughtFullText = (text: string) => {
  const parts = getAssistantThoughtParts(text);
  return [parts.title !== "Thinking" ? parts.title : "", parts.detail]
    .filter(Boolean)
    .join("\n\n");
};

const getActivityEventTitle = (event: TranscriptEvent) => {
  if (event.kind === "user-prompt") return "Goal";
  if (event.kind === "assistant-text") {
    return getAssistantThoughtParts(event.text).title;
  }
  if (event.kind === "tool-invocation") {
    return cleanActivityTitle(event.title ?? getToolDisplayName(event.toolName));
  }
  if (event.kind === "tool-result") {
    return cleanActivityTitle(event.title ?? getToolDisplayName(event.toolName));
  }
  if (event.kind === "max-turns-reached") return "Turn Limit";
  if (event.kind === "agent-result") return event.isError ? "Issue" : "Done";
  return "Activity";
};

const getActivityEventDetail = (event: TranscriptEvent) => {
  if (event.kind === "user-prompt") return summarizeText(event.text);
  if (event.kind === "assistant-text") {
    return summarizeText(getAssistantThoughtParts(event.text).detail);
  }
  if (event.kind === "tool-invocation") {
    return event.description ?? summarizeArgs(event.arguments);
  }
  if (event.kind === "tool-result") {
    const inputSummary = summarizeArgs(event.toolParameterValues);
    const outputSummary = summarizeToolOutput(
      event.content ?? event.detailedContent,
      180,
    );
    if (inputSummary && outputSummary) {
      return `${inputSummary} - ${outputSummary}`;
    }
    if (outputSummary) return outputSummary;
    return inputSummary;
  }
  if (event.kind === "max-turns-reached") {
    return `${event.turnCount} of ${event.maxTurns} turns used`;
  }
  if (event.kind === "agent-result") {
    return [
      typeof event.durationMs === "number"
        ? `${Math.round(event.durationMs / 1000)}s`
        : "",
      event.stopReason ?? "",
    ]
      .filter(Boolean)
      .join(" - ");
  }
  return "";
};

const getActivityEventRawDetails = (event: TranscriptEvent): RawDetailBlock[] => {
  if (event.kind === "assistant-text") {
    const value = getAssistantThoughtFullText(event.text);
    return value ? [{ value, variant: "text" }] : [];
  }
  if (event.kind === "tool-invocation") {
    const args = prettyPrintRecord(event.arguments);
    return args ? [{ label: "Call", value: args }] : [];
  }
  if (event.kind === "tool-result") {
    const blocks: RawDetailBlock[] = [];
    const params = prettyPrintRecord(event.toolParameterValues);
    if (params) blocks.push({ label: "Inputs", value: params });
    const output = event.detailedContent ?? event.content;
    if (output) blocks.push({ label: "Output", value: stripReadLineNumbers(output) });
    return blocks;
  }
  return [];
};

const mergeToolInvocationResult = (
  invocation: TranscriptEvent,
  result: TranscriptEvent,
): TranscriptEvent => {
  if (invocation.kind !== "tool-invocation" || result.kind !== "tool-result") {
    return result;
  }

  return {
    ...result,
    toolName: result.toolName ?? invocation.toolName,
    title: result.title ?? invocation.title,
    toolParameterValues: result.toolParameterValues ?? invocation.arguments,
  };
};

const getActivityGroup = (event: TranscriptEvent) => {
  if (event.kind === "user-prompt") {
    return "Goal";
  }
  if (event.kind === "assistant-text") {
    return "Thinking";
  }
  if (event.kind === "agent-result") {
    return event.isError ? "Issues" : "Complete";
  }
  if (event.kind === "max-turns-reached") return "Issues";

  const toolName =
    event.kind === "tool-invocation" ? event.toolName : event.toolName ?? "";
  const key = getToolKey(toolName);

  if (
    key.includes("read") ||
    key.includes("grep") ||
    key.includes("glob") ||
    key.includes("search") ||
    key.includes("view")
  ) {
    return "Reading";
  }
  if (
    key.includes("write") ||
    key.includes("edit") ||
    key.includes("save") ||
    key.includes("commit") ||
    key.includes("patch")
  ) {
    return "Editing";
  }
  if (
    key.includes("bash") ||
    key.includes("command") ||
    key.includes("test") ||
    key.includes("build") ||
    key.includes("publish")
  ) {
    return "Checks";
  }
  return "Other";
};

const getActivityIcon = (event: TranscriptEvent) => {
  const group = getActivityGroup(event);
  if (event.kind === "user-prompt") return MessageSquareText;
  if (group === "Thinking") return Brain;
  if (group === "Reading") return FileSearch;
  if (group === "Editing") return Pencil;
  if (group === "Checks") return Terminal;
  if (group === "Complete") return CheckCircle2;
  if (group === "Issues") return TriangleAlert;
  return Wrench;
};

const ACTIVITY_GROUP_LABELS: Record<ActivityGroupName, string> = {
  Goal: "Goal",
  Thinking: "Thinking",
  Reading: "Reading",
  Editing: "Editing",
  Checks: "Checks",
  Issues: "Issues",
  Complete: "Complete",
  Other: "Other",
};

const ACTIVITY_GROUP_STYLES: Record<
  ActivityGroupName,
  {
    accent: string;
    header: string;
    icon: string;
    text: string;
    badge: string;
  }
> = {
  Goal: {
    accent: "bg-sky-500",
    header: "bg-sky-50/80 dark:bg-sky-950/20",
    icon: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-300",
    text: "text-sky-700 dark:text-sky-300",
    badge: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-300",
  },
  Thinking: {
    accent: "bg-cyan-500",
    header: "bg-cyan-50/80 dark:bg-cyan-950/20",
    icon: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-950/30 dark:text-cyan-300",
    text: "text-cyan-700 dark:text-cyan-300",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-950/30 dark:text-cyan-300",
  },
  Reading: {
    accent: "bg-indigo-500",
    header: "bg-indigo-50/80 dark:bg-indigo-950/20",
    icon: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-300",
    text: "text-indigo-700 dark:text-indigo-300",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-300",
  },
  Editing: {
    accent: "bg-amber-500",
    header: "bg-amber-50/80 dark:bg-amber-950/20",
    icon: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300",
    text: "text-amber-700 dark:text-amber-300",
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300",
  },
  Checks: {
    accent: "bg-violet-500",
    header: "bg-violet-50/80 dark:bg-violet-950/20",
    icon: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/30 dark:text-violet-300",
    text: "text-violet-700 dark:text-violet-300",
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-950/30 dark:text-violet-300",
  },
  Issues: {
    accent: "bg-rose-500",
    header: "bg-rose-50/80 dark:bg-rose-950/20",
    icon: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300",
    text: "text-rose-700 dark:text-rose-300",
    badge: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-300",
  },
  Complete: {
    accent: "bg-emerald-500",
    header: "bg-emerald-50/80 dark:bg-emerald-950/20",
    icon: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300",
    text: "text-emerald-700 dark:text-emerald-300",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  Other: {
    accent: "bg-slate-400",
    header: "bg-slate-50/80 dark:bg-zinc-900/70",
    icon: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-zinc-900 dark:text-slate-300",
    text: "text-slate-600 dark:text-slate-300",
    badge: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-zinc-900 dark:text-slate-300",
  },
};

const getActivityGroupIcon = (group: ActivityGroupName) => {
  if (group === "Goal") return MessageSquareText;
  if (group === "Thinking") return Brain;
  if (group === "Reading") return FileSearch;
  if (group === "Editing") return Pencil;
  if (group === "Checks") return Terminal;
  if (group === "Issues") return TriangleAlert;
  if (group === "Complete") return CheckCircle2;
  return Wrench;
};

const ActivityEventRow = ({ event }: { event: TranscriptEvent }) => {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const Icon = getActivityIcon(event);
  const group = getActivityGroup(event);
  const styles = ACTIVITY_GROUP_STYLES[group];
  const title = getActivityEventTitle(event);
  const detail = getActivityEventDetail(event);
  const rawDetails = getActivityEventRawDetails(event);
  const isGenericLabelRow =
    (group === "Thinking" && title === "Thinking") ||
    (group === "Goal" && title === "Goal");
  const primaryText = isGenericLabelRow ? detail || title : title;
  const secondaryText = isGenericLabelRow ? "" : detail;
  const status =
    event.kind === "tool-invocation"
      ? getVisibleStatus(event.status)
      : event.kind === "tool-result"
        ? getVisibleStatus(event.status)
        : "";
  const hasRawDetails = rawDetails.length > 0;

  return (
    <div className="group relative flex min-w-0 items-start gap-2.5 border-b border-slate-200/60 bg-white px-3 py-2.5 last:border-b-0 dark:border-white/10 dark:bg-zinc-950">
      <span
        className={cn(
          "absolute left-0 top-0 h-full w-px opacity-60",
          styles.accent,
        )}
      />
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
          styles.icon,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              isGenericLabelRow
                ? "line-clamp-3 whitespace-normal text-xs font-normal leading-relaxed text-muted-foreground"
                : "truncate text-sm font-medium text-foreground",
            )}
          >
            {primaryText}
          </span>
          {status ? (
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                styles.badge,
              )}
            >
              {status}
            </span>
          ) : null}
        </div>
        {secondaryText ? (
          <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-muted-foreground">
            {secondaryText}
          </p>
        ) : null}
        {isDetailOpen ? (
          <div className="mt-2 space-y-2 rounded-md border border-slate-200/70 bg-slate-50/80 p-2 dark:border-white/10 dark:bg-zinc-900/70">
            {rawDetails.map((block, index) => (
              <div key={`${block.label ?? "detail"}-${index}`} className="space-y-1">
                {block.label ? (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {block.label}
                  </p>
                ) : null}
                {block.variant === "text" ? (
                  <p className="whitespace-pre-wrap break-words rounded bg-white p-2 text-xs leading-relaxed text-muted-foreground dark:bg-zinc-950">
                    {block.value}
                  </p>
                ) : (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 text-[11px] leading-relaxed text-slate-700 dark:bg-zinc-950 dark:text-zinc-200">
                    {block.value}
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        <span className="hidden text-[10px] text-muted-foreground/60 sm:inline">
          {formatTimestamp(event.timestamp)}
        </span>
        {hasRawDetails ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            title={isDetailOpen ? "Hide details" : "Show details"}
            onClick={() => setIsDetailOpen((value) => !value)}
          >
            {isDetailOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const ActivityMessageRow = ({ message }: { message: ChatMessage }) => {
  if (message.status === "error") {
    return (
      <div className="border-b border-slate-200/60 px-3 py-3 last:border-b-0 dark:border-white/10">
        <MessageBubble {...message} />
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200/60 px-3 py-2.5 last:border-b-0 dark:border-white/10">
      <div className="flex items-center gap-2">
        <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {message.role === "system" ? "System" : message.author}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {message.time}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 pl-5 text-xs text-muted-foreground">
        {summarizeText(message.content)}
      </p>
    </div>
  );
};

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
      event: TranscriptEvent;
    };

type ActivityTimelineSection = {
  id: string;
  groupName: ActivityGroupName;
  items: TimelineItem[];
  latestCreatedAt: number | null;
  preview: string;
};

type CurrentWorkSummary = {
  title: string;
  detail: string;
  groupName: ActivityGroupName;
};

const getTimelineItemActivityGroup = (
  item: TimelineItem,
): ActivityGroupName => {
  if (item.source === "transcript") {
    return getActivityGroup(item.event);
  }
  return item.message.status === "error" ? "Issues" : "Other";
};

const getTimelineItemPreview = (item: TimelineItem) => {
  if (item.source === "message") {
    return summarizeText(item.message.content, 120);
  }

  return summarizeText(getActivityEventDetail(item.event), 120);
};

const getCurrentWorkSummaryFromEvent = (
  event: TranscriptEvent,
): CurrentWorkSummary | null => {
  if (event.kind === "user-prompt") {
    return {
      title: "Goal",
      detail: summarizeText(event.text, 140),
      groupName: "Goal",
    };
  }

  if (event.kind === "assistant-text") {
    const parts = getAssistantThoughtParts(event.text);
    return {
      title: parts.title || "Thinking",
      detail: summarizeText(parts.detail, 140),
      groupName: "Thinking",
    };
  }

  if (event.kind === "tool-invocation" || event.kind === "tool-result") {
    return {
      title: getActivityEventTitle(event),
      detail: summarizeText(getActivityEventDetail(event), 140),
      groupName: getActivityGroup(event),
    };
  }

  if (event.kind === "max-turns-reached") {
    return {
      title: "Turn limit reached",
      detail: getActivityEventDetail(event),
      groupName: "Issues",
    };
  }

  if (event.kind === "agent-result") {
    return {
      title: event.isError ? "Run needs attention" : "Run complete",
      detail: getActivityEventDetail(event),
      groupName: event.isError ? "Issues" : "Complete",
    };
  }

  return null;
};

const buildChronologicalActivitySections = (
  timeline: TimelineItem[],
): ActivityTimelineSection[] => {
  const sections: ActivityTimelineSection[] = [];

  for (const item of timeline) {
    const groupName = getTimelineItemActivityGroup(item);
    const current = sections[sections.length - 1];

    if (!current || current.groupName !== groupName) {
      sections.push({
        id: `${sections.length}-${groupName}-${item.key}`,
        groupName,
        items: [item],
        latestCreatedAt: item.createdAt,
        preview: getTimelineItemPreview(item),
      });
      continue;
    }

    current.items.push(item);
    if (
      item.createdAt !== null &&
      (current.latestCreatedAt === null || item.createdAt > current.latestCreatedAt)
    ) {
      current.latestCreatedAt = item.createdAt;
    }
    const preview = getTimelineItemPreview(item);
    if (preview) {
      current.preview = preview;
    }
  }

  return sections;
};

const CurrentWorkCard = ({ work }: { work: CurrentWorkSummary }) => {
  const styles = ACTIVITY_GROUP_STYLES[work.groupName];
  const Icon = getActivityGroupIcon(work.groupName);

  return (
    <div
      className={cn(
        "mb-2 flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2.5 shadow-sm",
        styles.header,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
          styles.icon,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {work.title}
        </p>
        {work.detail ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
            {work.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
};

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
type ChatInterfaceProps = {
  previewFullscreen?: boolean;
};

export const ChatInterface = ({
  previewFullscreen = false,
}: ChatInterfaceProps) => {
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
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<InspectorTab>("activity");
  const [activitySectionOverrides, setActivitySectionOverrides] = useState<
    Record<string, boolean>
  >({});
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
  const [pendingImageAttachments, setPendingImageAttachments] = useState<
    PendingImageAttachment[]
  >([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  // Local draft so the field can be cleared/typed freely; committed (and
  // sanitized) to the store on blur.
  const [maxTurnsDraft, setMaxTurnsDraft] = useState(String(maxTurns));
  const [inspectorWidth, setInspectorWidth] = useState(readStoredInspectorWidth);

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
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef(0);
  const isPinnedToBottomRef = useRef(true);
  const wasStreamingRef = useRef(false);
  const fetchedSkillsProjectIdRef = useRef<string | null>(null);
  const loadedSelectedEnginesProjectIdRef = useRef<string | null>(null);
  const slashSignatureRef = useRef<string | null>(null);
  const trimmedMessage = inputMessage.trim();
  const isStreaming = pendingMessageId !== null;
  const hasPendingImages = pendingImageAttachments.length > 0;
  const isSendDisabled = trimmedMessage.length === 0 && !hasPendingImages;
  const activeHarnessLabel = getHarnessLabel(harnessType);
  const inspectorStyle = useMemo(
    () =>
      ({
        "--inspector-width": `${inspectorWidth}px`,
      }) as CSSProperties,
    [inspectorWidth],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        INSPECTOR_WIDTH_STORAGE_KEY,
        String(inspectorWidth),
      );
    } catch {
      // Ignore storage failures; the live resize still works.
    }
  }, [inspectorWidth]);

  const latestUserGoal = useMemo(() => {
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      const event = transcriptEvents[index];
      if (event.kind === "user-prompt" && event.text.trim()) {
        return event.text.trim();
      }
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "user" && message.content.trim()) {
        return message.content.trim();
      }
    }

    return "";
  }, [messages, transcriptEvents]);

  const latestMilestone = useMemo(() => {
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      const event = transcriptEvents[index];
      if (event.kind === "agent-result") {
        return event.isError ? "Run needs attention" : "Run complete";
      }
      if (event.kind === "tool-result" || event.kind === "tool-invocation") {
        return getActivityEventTitle(event);
      }
      if (event.kind === "assistant-text" && event.text.trim()) {
        const parts = getAssistantThoughtParts(event.text);
        return parts.title || "Thinking";
      }
    }

    return "";
  }, [transcriptEvents]);

  const currentWork = useMemo(() => {
    for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
      const summary = getCurrentWorkSummaryFromEvent(transcriptEvents[index]);
      if (summary) {
        return summary;
      }
    }

    if (latestUserGoal) {
      return {
        title: "Goal",
        detail: summarizeText(latestUserGoal, 140),
        groupName: "Goal" as const,
      };
    }

    return null;
  }, [latestUserGoal, transcriptEvents]);

  const composerGoal = latestUserGoal || "Ready for your next instruction.";
  const currentStatusText = isStreaming
    ? `${activeHarnessLabel} is working`
    : latestMilestone || "Idle";
  const highlightedWork =
    isStreaming && currentWork?.groupName !== "Goal" ? currentWork : null;
  const showAssistantChrome = !previewFullscreen;
  const composerTone: ActivityGroupName =
    unseenIssuesCount > 0 ? "Issues" : isStreaming ? "Complete" : "Other";
  const composerStyles = ACTIVITY_GROUP_STYLES[composerTone];

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

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    const toolItemByUseId = new Map<string, TimelineItem>();
    for (const message of messages) {
      if (message.role === "user") {
        continue;
      }
      items.push({
        source: "message",
        createdAt: message.createdAt ?? null,
        key: `msg-${message.id}`,
        message,
      });
    }
    transcriptEvents.forEach((event, index) => {
      const parsed = Date.parse(event.timestamp);
      const stableKey = getTranscriptEventStableKey(event);
      const item: TimelineItem = {
        source: "transcript",
        createdAt: Number.isFinite(parsed) ? parsed : null,
        key: stableKey ?? `transcript-${event.kind}-${index}`,
        event,
      };

      if (event.kind === "tool-invocation") {
        const existing = toolItemByUseId.get(event.toolUseId);
        if (existing?.source === "transcript") {
          existing.event =
            existing.event.kind === "tool-result"
              ? mergeToolInvocationResult(event, existing.event)
              : event;
          existing.key = stableKey ?? existing.key;
          existing.createdAt = item.createdAt ?? existing.createdAt;
          return;
        }

        toolItemByUseId.set(event.toolUseId, item);
        items.push(item);
        return;
      }

      if (event.kind === "tool-result") {
        const existing = toolItemByUseId.get(event.toolUseId);
        if (existing?.source === "transcript") {
          existing.event = mergeToolInvocationResult(existing.event, event);
          existing.key = stableKey ?? existing.key;
          return;
        }

        toolItemByUseId.set(event.toolUseId, item);
      }

      items.push(item);
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

  const activitySections = useMemo(
    () => buildChronologicalActivitySections(timeline),
    [timeline],
  );

  const toggleActivitySection = useCallback(
    (sectionId: string, currentExpanded: boolean) => {
      setActivitySectionOverrides((current) => ({
        ...current,
        [sectionId]: !currentExpanded,
      }));
    },
    [],
  );

  const handleInspectorResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (typeof window === "undefined") {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const startX = event.clientX;
      const startWidth = inspectorWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMove = (moveEvent: globalThis.PointerEvent) => {
        const nextWidth = clampInspectorWidth(
          startWidth + startX - moveEvent.clientX,
          window.innerWidth,
        );
        setInspectorWidth(nextWidth);
      };

      const handleUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [inspectorWidth],
  );

  const handleAddImageFiles = useCallback(
    async (files: FileList | File[]) => {
      const allFiles = Array.from(files);
      if (allFiles.length === 0) {
        return;
      }

      const availableSlots =
        MAX_IMAGE_ATTACHMENTS - pendingImageAttachments.length;
      if (availableSlots <= 0) {
        toast.error(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`);
        return;
      }

      const acceptedFiles: File[] = [];
      for (const file of allFiles) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name || "File"} is not an image.`);
          continue;
        }
        if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
          toast.error(
            `${file.name || "Image"} is larger than ${formatAttachmentSize(
              MAX_IMAGE_ATTACHMENT_BYTES,
            )}.`,
          );
          continue;
        }
        acceptedFiles.push(file);
      }

      const limitedFiles = acceptedFiles.slice(0, availableSlots);
      if (acceptedFiles.length > limitedFiles.length) {
        toast.error(`Only ${availableSlots} more image(s) can be attached.`);
      }
      if (limitedFiles.length === 0) {
        return;
      }

      try {
        const nextAttachments = await Promise.all(
          limitedFiles.map(readImageAttachment),
        );
        setPendingImageAttachments((current) => [
          ...current,
          ...nextAttachments,
        ]);
      } catch (error) {
        console.error("Failed to read image attachment:", error);
        toast.error("Could not read one of the selected images.");
      }
    },
    [pendingImageAttachments.length],
  );

  const handleImageInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        void handleAddImageFiles(event.target.files);
      }
      event.target.value = "";
    },
    [handleAddImageFiles],
  );

  const handleMessagePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData.files).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (imageFiles.length > 0) {
        void handleAddImageFiles(imageFiles);
      }
    },
    [handleAddImageFiles],
  );

  const handleRemoveImageAttachment = useCallback((attachmentId: string) => {
    setPendingImageAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    );
  }, []);

  const handleRemoveQueuedMessage = useCallback((messageId: string) => {
    setQueuedMessages((current) =>
      current.filter((message) => message.id !== messageId),
    );
  }, []);

  const sendMessageNow = useCallback(
    (message: string, attachments: PendingImageAttachment[] = []) => {
      dispatch(
        submitAgentMessage({
          message,
          imageDataUris: attachments.map((attachment) => attachment.dataUri),
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
      runPixel,
      runPixelAsync,
    ],
  );

  const queueOrSendMessage = useCallback(
    (message: string, attachments: PendingImageAttachment[] = []) => {
      const content = message.trim();
      if (!content && attachments.length === 0) {
        return false;
      }

      if (isStreaming) {
        setQueuedMessages((current) => [
          ...current,
          {
            id: createQueuedMessageId(),
            content,
            attachments: attachments.map((attachment) => ({ ...attachment })),
            createdAt: Date.now(),
          },
        ]);
        toast.success("Message queued", {
          description: "It will send after the current run finishes.",
          duration: 2500,
        });
        return true;
      }

      sendMessageNow(content, attachments);
      return true;
    },
    [isStreaming, sendMessageNow],
  );

  useEffect(() => {
    setQueuedMessages([]);
  }, [roomId]);

  useEffect(() => {
    if (isStreaming || queuedMessages.length === 0) {
      return;
    }

    const nextQueuedMessage = queuedMessages[0];
    const timeoutId = window.setTimeout(() => {
      setQueuedMessages((current) => {
        if (current[0]?.id !== nextQueuedMessage.id) {
          return current;
        }
        return current.slice(1);
      });
      sendMessageNow(nextQueuedMessage.content, nextQueuedMessage.attachments);
    }, QUEUE_DRAIN_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isStreaming, queuedMessages, sendMessageNow]);

  const handleSendMessage = useCallback(() => {
    if (!queueOrSendMessage(trimmedMessage, pendingImageAttachments)) {
      return;
    }

    dispatch(setInputMessage(""));
    setPendingImageAttachments([]);
  }, [
    dispatch,
    pendingImageAttachments,
    queueOrSendMessage,
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
      setActiveTab("activity");
      setIsInspectorOpen(true);
      queueOrSendMessage(buildIssuesRepairPrompt(selectedRecords));
    },
    [dispatch, issueRecords, queueOrSendMessage, roomId],
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
      {showAssistantChrome ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-30",
            isInspectorOpen
              ? "lg:right-[var(--inspector-width)]"
              : "lg:right-0",
          )}
          style={inspectorStyle}
        >
        <div className="pointer-events-auto overflow-visible border-t border-slate-200/80 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95 dark:shadow-black/30">
          <div className={cn("h-1", composerStyles.accent)} />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200/70 px-4 py-2 dark:border-white/10">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.18em]",
                    composerStyles.text,
                  )}
                >
                  Current goal
                </span>
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    composerStyles.accent,
                  )}
                />
                <span className="truncate text-xs text-muted-foreground">
                  {currentStatusText}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                {summarizeText(composerGoal, 160)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn("hidden h-7 gap-1 px-2 xl:flex", composerStyles.badge)}
              >
                <Bot className="h-3.5 w-3.5" />
                {activeHarnessLabel}
              </Badge>
              <Badge
                variant="outline"
                className="hidden h-7 px-2 text-[11px] xl:flex"
              >
                {toTitleCase(permissionMode)}
              </Badge>
              {unseenIssuesCount > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => {
                    setIsInspectorOpen(true);
                    setActiveTab("issues");
                  }}
                >
                  <TriangleAlert className="h-3.5 w-3.5" />
                  {unseenIssuesCount}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 border-slate-200/80 bg-white px-2 text-xs shadow-sm dark:border-white/10 dark:bg-zinc-900"
                onClick={() => setIsInspectorOpen((value) => !value)}
              >
                {isInspectorOpen ? (
                  <PanelRightClose className="h-3.5 w-3.5" />
                ) : (
                  <PanelRightOpen className="h-3.5 w-3.5" />
                )}
                Inspector
              </Button>
            </div>
          </div>
          <div className="flex items-end gap-2 px-4 pb-3 pt-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageInputChange}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Attach image"
              className={cn(
                "h-9 w-9 shrink-0 rounded-full border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900",
                hasPendingImages &&
                  "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
              )}
              onClick={() => imageInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="relative flex-1">
              {slashMenu && activeSlashCommand ? (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-xl overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10 dark:border-white/10 dark:bg-zinc-950">
                  <div className="flex max-h-72">
                    <div className="w-32 shrink-0 space-y-0.5 overflow-y-auto border-r border-slate-200/70 bg-slate-50 p-1.5 dark:border-white/10 dark:bg-zinc-900">
                      {slashMenu.commands.map((command, index) => {
                        const isActive = index === slashCommandIndex;
                        return (
                          <button
                            key={command.name}
                            type="button"
                            onClick={() => selectSlashCommand(index)}
                            className={cn(
                              "flex w-full flex-col rounded-md px-2.5 py-1.5 text-left transition-colors",
                              isActive
                                ? "bg-white shadow-sm dark:bg-zinc-800"
                                : "hover:bg-white/70 dark:hover:bg-zinc-800/60",
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
                              "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left transition-colors",
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
                </div>
              ) : null}
              {queuedMessages.length > 0 ? (
                <div className="mb-2 rounded-lg border border-emerald-200/70 bg-emerald-50/70 p-2 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <CircleDot className="h-3 w-3" />
                      Queued
                    </span>
                    <span>{queuedMessages.length}</span>
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {queuedMessages.slice(0, 2).map((message) => (
                      <div
                        key={message.id}
                        className="flex items-center gap-2 rounded-md border border-white/80 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {getQueuedMessagePreview(message)}
                        </span>
                        {message.attachments.length > 0 ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {message.attachments.length} image
                            {message.attachments.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          title="Remove queued message"
                          className="rounded-full p-1 text-muted-foreground transition hover:bg-slate-100 hover:text-foreground dark:hover:bg-zinc-800"
                          onClick={() => handleRemoveQueuedMessage(message.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {queuedMessages.length > 2 ? (
                      <p className="px-1 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                        +{queuedMessages.length - 2} more
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {pendingImageAttachments.length > 0 ? (
                <div className="mb-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto rounded-lg border border-sky-200/70 bg-sky-50/70 p-2 dark:border-sky-500/20 dark:bg-sky-500/10">
                  {pendingImageAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="group flex max-w-56 items-center gap-2 rounded-md border border-white/80 bg-white px-2 py-1.5 shadow-sm dark:border-white/10 dark:bg-zinc-900"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-zinc-800">
                        <img
                          src={attachment.dataUri}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
                          <span className="truncate">{attachment.name}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {formatAttachmentSize(attachment.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        title="Remove image"
                        className="ml-auto rounded-full p-1 text-muted-foreground transition hover:bg-slate-100 hover:text-foreground dark:hover:bg-zinc-800"
                        onClick={() =>
                          handleRemoveImageAttachment(attachment.id)
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <Textarea
                placeholder="Type a message...  (/ for commands)"
                rows={2}
                ref={chatInputRef}
                value={inputMessage}
                onChange={handleMessageChange}
                onKeyDown={handleMessageKeyDown}
                onPaste={handleMessagePaste}
                onSelect={handleInputSelect}
                className="max-h-60 min-h-[3.25rem] w-full resize-none rounded-lg border-slate-200/80 bg-white text-sm shadow-sm focus-visible:ring-slate-400/30 dark:border-white/10 dark:bg-zinc-900"
              />
            </div>
            <Button
              disabled={isSendDisabled}
              onClick={handleSendMessage}
              size="icon"
              title={isStreaming ? "Queue message" : "Send message"}
              className="h-9 w-9 shrink-0 rounded-full bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/30 disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-zinc-700"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
        </div>
      ) : null}

      {showAssistantChrome && isInspectorOpen ? (
        <aside
          className="absolute inset-y-3 right-3 z-40 flex w-[min(var(--inspector-width),calc(100%-1.5rem))] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10 dark:border-white/10 dark:bg-zinc-950 dark:shadow-black/30 lg:relative lg:inset-auto lg:z-auto lg:h-full lg:w-[var(--inspector-width)]"
          style={inspectorStyle}
        >
          <button
            type="button"
            aria-label="Resize inspector"
            title="Drag to resize inspector"
            onPointerDown={handleInspectorResizeStart}
            onDoubleClick={() => setInspectorWidth(INSPECTOR_DEFAULT_WIDTH)}
            className="absolute inset-y-0 left-0 z-30 flex w-5 cursor-col-resize touch-none select-none items-center justify-center border-r border-slate-200/50 bg-white/70 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:bg-slate-100 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-300"
          >
            <span className="h-14 w-1 rounded-full bg-current" />
          </button>
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as InspectorTab)}
            className="flex h-full min-h-0 flex-col pl-5"
          >
          <header className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white dark:border-white/10 dark:from-zinc-900 dark:to-zinc-950">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                    composerStyles.icon,
                  )}
                >
                  <Activity className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    Run Inspector
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ConversationHistoryPanel />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => dispatch(startNewRoom())}
                  title="New Chat"
                >
                  <SquarePen className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsInspectorOpen(false)}
                  title="Collapse inspector"
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <TabsList className="grid h-9 w-full grid-cols-5 rounded-none border-t border-slate-200/80 bg-transparent p-1 dark:border-white/10">
              <TabsTrigger
                value="activity"
                className="gap-1 px-1 text-xs data-[state=active]:bg-sky-50 data-[state=active]:text-sky-700 dark:data-[state=active]:bg-sky-950/30 dark:data-[state=active]:text-sky-300"
              >
                <Activity className="h-3.5 w-3.5" />
                Activity
              </TabsTrigger>
              <TabsTrigger
                value="issues"
                className="gap-1 px-1 text-xs data-[state=active]:bg-rose-50 data-[state=active]:text-rose-700 dark:data-[state=active]:bg-rose-950/30 dark:data-[state=active]:text-rose-300"
              >
                <TriangleAlert className="h-3.5 w-3.5" />
                <span>Issues</span>
                {unseenIssuesCount > 0 ? (
                  <Badge
                    variant="destructive"
                    className="rounded-full px-1.5 py-0 text-[10px]"
                  >
                    {unseenIssuesCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="engines"
                className="gap-1 px-1 text-xs data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-950/30 dark:data-[state=active]:text-violet-300"
              >
                <Terminal className="h-3.5 w-3.5" />
                Engines
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="gap-1 px-1 text-xs data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/30 dark:data-[state=active]:text-indigo-300"
              >
                <BookOpen className="h-3.5 w-3.5" />
                History
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="gap-1 px-1 text-xs data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-950/30 dark:data-[state=active]:text-amber-300"
              >
                <Settings className="h-3.5 w-3.5" />
                Agent
              </TabsTrigger>
            </TabsList>
          </header>

          <TabsContent
            value="activity"
            className="mt-0 flex min-h-0 flex-1 flex-col bg-white dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-3 py-2 dark:border-white/10">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    isStreaming ? "bg-emerald-500" : "bg-slate-300",
                  )}
                />
                <span className="truncate">
                  {isStreaming ? `${activeHarnessLabel} is working` : "Recent activity"}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "h-6 px-2 text-[10px]",
                  isStreaming &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300",
                )}
              >
                {isStreaming ? "Live" : "Idle"}
              </Badge>
            </div>
            <div
              ref={messagesContainerRef}
              className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-2 dark:bg-zinc-950"
            >
              {messages.length === 0 && transcriptEvents.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-muted-foreground dark:border-white/10 dark:bg-zinc-900">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold tracking-tight">
                      No activity yet
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Activity for the current run will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {highlightedWork ? (
                    <CurrentWorkCard work={highlightedWork} />
                  ) : null}
                  <div className="space-y-2">
                    {activitySections.map((section) => {
                      const styles = ACTIVITY_GROUP_STYLES[section.groupName];
                      const Icon = getActivityGroupIcon(section.groupName);
                      const isLatestSection =
                        activitySections[activitySections.length - 1]?.id ===
                        section.id;
                      const defaultExpanded =
                        section.groupName !== "Thinking" ||
                        section.items.length === 1 ||
                        isLatestSection;
                      const isExpanded =
                        activitySectionOverrides[section.id] ?? defaultExpanded;
                      const latestTime =
                        section.latestCreatedAt === null
                          ? ""
                          : formatTimestamp(
                              new Date(section.latestCreatedAt).toISOString(),
                            );

                      return (
                        <section
                          key={section.id}
                          className="overflow-hidden rounded-lg border border-slate-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-950"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              toggleActivitySection(section.id, isExpanded)
                            }
                            className={cn(
                              "relative flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
                              styles.header,
                            )}
                          >
                            <span
                              className={cn(
                                "absolute left-0 top-0 h-full w-0.5",
                                styles.accent,
                              )}
                            />
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                                styles.icon,
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {ACTIVITY_GROUP_LABELS[section.groupName]}
                              </span>
                            </span>
                            {latestTime ? (
                              <span className="hidden shrink-0 text-[10px] text-muted-foreground/70 sm:inline">
                                {latestTime}
                              </span>
                            ) : null}
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                          {isExpanded ? (
                            <div className="border-t border-slate-200/70 dark:border-white/10">
                              {section.items.map((item) =>
                                item.source === "message" ? (
                                  <ActivityMessageRow
                                    key={item.key}
                                    message={item.message}
                                  />
                                ) : (
                                  <ActivityEventRow
                                    key={item.key}
                                    event={item.event}
                                  />
                                ),
                              )}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                  {isStreaming ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      <span>{activeHarnessLabel} is working...</span>
                      {queuedMessages.length > 0 ? (
                        <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                          {queuedMessages.length} queued
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-lg border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-zinc-950">
                      <LatestCommitChip
                        onOpenHistory={() => setActiveTab("history")}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

          </TabsContent>

          <TabsContent
            value="issues"
            className="mt-0 flex min-h-0 flex-1 bg-white dark:bg-zinc-950"
          >
            <IssuesPanel onAskToFix={handleAskToFixIssues} />
          </TabsContent>

          <TabsContent
            value="engines"
            className="mt-0 min-h-0 flex-1 overflow-y-auto bg-white p-4 dark:bg-zinc-950"
          >
            <EnginesPanel />
          </TabsContent>

          <TabsContent
            value="history"
            className="mt-0 flex min-h-0 flex-1 bg-white dark:bg-zinc-950"
          >
            <HistoryPanel />
          </TabsContent>

          <TabsContent
            value="settings"
            className="mt-0 min-h-0 flex-1 overflow-y-auto bg-white p-4 dark:bg-zinc-950"
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
        </aside>
      ) : showAssistantChrome ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute right-4 top-4 z-20 h-8 gap-1.5 border-slate-200/80 bg-white/90 px-2 text-xs shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-950/90"
          onClick={() => setIsInspectorOpen(true)}
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Activity
        </Button>
      ) : null}

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
