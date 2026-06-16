export type EffortLevel =
  | "auto"
  | "low"
  | "medium"
  | "high"
  | "max";

const EFFORT_ALIASES: Record<string, EffortLevel> = {
  auto: "auto",
  default: "auto",
  reset: "auto",
  low: "low",
  medium: "medium",
  med: "medium",
  high: "high",
  max: "max",
  xhigh: "max",
  ultra: "max",
};

const THINKING_ON_ALIASES = new Set(["on", "true", "enable", "enabled", "yes", "1"]);
const THINKING_OFF_ALIASES = new Set(["off", "false", "disable", "disabled", "no", "0"]);

const ULTRATHINK_PATTERN = /\bultrathink\b/i;

export type ParseResult = {
  effortUpdate?: EffortLevel;
  thinkingUpdate?: boolean | "toggle";
  effortOneShot?: EffortLevel;
  cleanedMessage: string;
  feedback: string[];
  shouldSend: boolean;
  hadCommands: boolean;
};

const formatEffort = (level: EffortLevel | undefined): string =>
  level ? level : "auto";

const parseEffortArg = (arg: string | undefined): EffortLevel | "show" => {
  if (!arg) return "show";
  return EFFORT_ALIASES[arg.toLowerCase()] ?? "show";
};

const parseThinkingArg = (
  arg: string | undefined,
): boolean | "toggle" | "show" => {
  if (!arg) return "show";
  const lower = arg.toLowerCase();
  if (THINKING_ON_ALIASES.has(lower)) return true;
  if (THINKING_OFF_ALIASES.has(lower)) return false;
  if (lower === "toggle") return "toggle";
  return "show";
};

export const parseSlashCommands = (
  rawMessage: string,
  currentState: { effort: EffortLevel; thinkingEnabled: boolean },
): ParseResult => {
  const lines = rawMessage.split(/\r?\n/);
  const remainingLines: string[] = [];
  const feedback: string[] = [];
  let effortUpdate: EffortLevel | undefined;
  let thinkingUpdate: boolean | "toggle" | undefined;
  let hadCommands = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("/")) {
      remainingLines.push(line);
      continue;
    }

    const [command, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(" ");

    if (command === "/effort") {
      hadCommands = true;
      const parsed = parseEffortArg(arg);
      if (parsed === "show") {
        if (!arg) {
          feedback.push(
            `Current effort: \`${formatEffort(currentState.effort)}\` · thinking: \`${currentState.thinkingEnabled ? "on" : "off"}\``,
          );
        } else {
          feedback.push(
            `Unknown effort level \`${arg}\`. Valid: auto, low, medium, high, max.`,
          );
        }
      } else {
        effortUpdate = parsed;
        feedback.push(`Effort set to \`${parsed}\`.`);
      }
      continue;
    }

    if (command === "/thinking") {
      hadCommands = true;
      const parsed = parseThinkingArg(arg);
      if (parsed === "show") {
        if (!arg) {
          feedback.push(
            `Thinking is currently \`${currentState.thinkingEnabled ? "on" : "off"}\`.`,
          );
        } else {
          feedback.push(
            `Unknown thinking value \`${arg}\`. Use on / off / toggle.`,
          );
        }
      } else {
        thinkingUpdate = parsed;
        const resolved =
          parsed === "toggle" ? !currentState.thinkingEnabled : parsed;
        feedback.push(`Thinking ${resolved ? "enabled" : "disabled"}.`);
      }
      continue;
    }

    remainingLines.push(line);
  }

  const cleanedMessage = remainingLines.join("\n").trim();

  let effortOneShot: EffortLevel | undefined;
  if (ULTRATHINK_PATTERN.test(cleanedMessage)) {
    effortOneShot = "max";
    feedback.push("`ultrathink` detected — using max effort for this turn.");
  }

  return {
    effortUpdate,
    thinkingUpdate,
    effortOneShot,
    cleanedMessage,
    feedback,
    shouldSend: cleanedMessage.length > 0,
    hadCommands,
  };
};

export const effortToThinkingBudget = (level: EffortLevel): string | null => {
  switch (level) {
    case "auto":
      return null;
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "max":
      return "xhigh";
  }
};
