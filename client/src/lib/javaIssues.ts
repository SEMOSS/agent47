/**
 * Parser + types for `classes/compileerror.out` — the file SEMOSS's reactor
 * compiler writes when it builds a project's custom Java reactors.
 *
 * Format (one logical issue per `[SEVERITY] ...` line, with optional
 * indented continuation lines for additional context):
 *
 * ```
 * [ERROR] file:///<absolute-path>:<line> - <message>
 *   symbol:   class Foo
 *   location: package bar
 * [WARNING] file:///<absolute-path>:<line> - <message>
 * [MANDATORY_WARNING] file:///<absolute-path>:<line> - <message>
 * ```
 *
 * Only `[ERROR]` is critical; `[WARNING]` and `[MANDATORY_WARNING]` both
 * normalize to severity `"warning"`.
 */

export type JavaIssueSeverity = "error" | "warning";

export interface JavaIssue {
  /** Stable id derived from severity + file + line + message. */
  id: string;
  severity: JavaIssueSeverity;
  /** Absolute path stripped of the `file://` prefix. */
  filePath: string;
  /** 1-based line number from the compiler output. `null` if unparseable. */
  line: number | null;
  /** First-line compiler message (without continuation lines). */
  message: string;
  /** Full block including any indented continuation lines that followed. */
  detail: string;
}

const HEADER_RE =
  /^\[(ERROR|WARNING|MANDATORY_WARNING)\]\s+file:\/\/(.+?):(\d+)\s+-\s+(.*)$/;

const normalizeSeverity = (raw: string): JavaIssueSeverity =>
  raw === "ERROR" ? "error" : "warning";

const decodePath = (raw: string): string => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const makeId = (
  severity: JavaIssueSeverity,
  filePath: string,
  line: number | null,
  message: string,
): string => `${severity}|${filePath}|${line ?? ""}|${message}`;

/**
 * Parses the raw contents of `compileerror.out` into structured issues.
 * Returns `[]` for empty / unparseable input — callers can treat both as
 * "no compile issues".
 */
export const parseCompileErrorOutput = (raw: string | null | undefined): JavaIssue[] => {
  if (!raw || !raw.trim()) {
    return [];
  }

  const lines = raw.split(/\r?\n/);
  const issues: JavaIssue[] = [];
  let current: JavaIssue | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!current) return;
    current.detail = currentLines.join("\n");
    issues.push(current);
    current = null;
    currentLines = [];
  };

  for (const line of lines) {
    const match = HEADER_RE.exec(line);
    if (match) {
      flush();
      const severity = normalizeSeverity(match[1]);
      const filePath = decodePath(match[2]);
      const lineNum = Number.parseInt(match[3], 10);
      const message = match[4].trim();
      current = {
        id: makeId(
          severity,
          filePath,
          Number.isFinite(lineNum) ? lineNum : null,
          message,
        ),
        severity,
        filePath,
        line: Number.isFinite(lineNum) ? lineNum : null,
        message,
        detail: "",
      };
      currentLines = [line];
    } else if (current) {
      // continuation lines are typically indented; keep them attached
      if (line.trim() === "") {
        // blank line ends the current block
        flush();
      } else {
        currentLines.push(line);
      }
    }
    // lines that don't start a block and have no current block are ignored
  }

  flush();
  return issues;
};

/**
 * Builds the "ask agent to fix" prompt for selected Java compile issues.
 * Includes the full compiler block per issue (header + continuation lines
 * with symbol/location context) — the first-line message alone is rarely
 * enough to act on (e.g. "cannot find symbol" without the symbol name).
 */
export const buildJavaIssuesRepairPrompt = (issues: JavaIssue[]): string => {
  if (issues.length === 0) {
    return "";
  }

  const formatBlock = (issue: JavaIssue): string =>
    (issue.detail && issue.detail.trim()) || issue.message;

  const errorBlocks = issues
    .filter((i) => i.severity === "error")
    .map(formatBlock);
  const warningBlocks = issues
    .filter((i) => i.severity === "warning")
    .map(formatBlock);

  const sections: string[] = [];
  sections.push(
    "Fix the following Java compile issues in this project. The file paths in each block are absolute paths on the server; locate the corresponding files in the project workspace.",
  );
  if (errorBlocks.length > 0) {
    sections.push(`Errors (${errorBlocks.length}):\n\n${errorBlocks.join("\n\n")}`);
  }
  if (warningBlocks.length > 0) {
    sections.push(
      `Warnings (${warningBlocks.length}):\n\n${warningBlocks.join("\n\n")}`,
    );
  }
  return sections.join("\n\n");
};
