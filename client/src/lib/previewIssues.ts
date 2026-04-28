import { v4 as uuidv4 } from "uuid";

export type PreviewSignalKind = "runtime" | "console" | "api";
export type PreviewIssueKind = PreviewSignalKind;

export type PreviewSignalRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
};
export type PreviewIssueRequest = PreviewSignalRequest;

export type PreviewSignalResponse = {
  status?: number;
  statusText?: string;
  body?: string;
};
export type PreviewIssueResponse = PreviewSignalResponse;

export type PreviewSignalTransport = {
  kind: PreviewSignalKind;
  title?: string;
  message?: string;
  source?: string;
  stack?: string;
  timestamp?: string;
  request?: PreviewSignalRequest;
  response?: PreviewSignalResponse;
};
export type PreviewIssueTransport = PreviewSignalTransport;

export type PreviewSignalOccurrence = {
  timestamp: string;
  roomId: string;
};
export type PreviewIssueOccurrence = PreviewSignalOccurrence;

export type PreviewSignalRecord = {
  id: string;
  signature: string;
  kind: PreviewSignalKind;
  title: string;
  message: string;
  source: string;
  stack: string;
  request?: PreviewSignalRequest;
  response?: PreviewSignalResponse;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  projectId: string;
  roomId: string;
  previewSessionId: string;
  seen: boolean;
  reviewed: boolean;
  lastSentAt: string | null;
  occurrences: PreviewSignalOccurrence[];
};
export type PreviewIssueRecord = PreviewSignalRecord;

export type PreviewSignalContext = {
  projectId: string;
  roomId: string;
  previewSessionId: string;
};
export type PreviewIssueContext = PreviewSignalContext;

export type PreviewSignalCapability = {
  status: "idle" | "ready" | "unavailable";
  message: string;
};
export type PreviewIssueCapability = PreviewSignalCapability;

const MAX_TEXT_LENGTH = 1000;
const MAX_OCCURRENCES = 10;
const REDACTED_VALUE = "[redacted]";
const PATH_REPLACEMENT = "[path]";
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|passwd|session|api[-_]?key|key)$/i;

const truncateText = (value: string, maxLength = MAX_TEXT_LENGTH) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}…`;
};

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeWhitespace = (value?: string | null) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const stripOrigin = (value: string) =>
  value.replace(/^https?:\/\/[^/]+/i, "");

const normalizePathLikeText = (value?: string | null) => {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return "";
  }

  return truncateText(
    stripOrigin(trimmed)
      .replace(/\b\/Users\/[^\s)]+/g, PATH_REPLACEMENT)
      .replace(/\b[A-Z]:\\[^\s)]+/gi, PATH_REPLACEMENT)
      .replace(/\b\/var\/folders\/[^\s)]+/g, PATH_REPLACEMENT)
      .replace(/\b\/private\/[^\s)]+/g, PATH_REPLACEMENT)
      .replace(/\bfile:\/\/[^\s)]+/gi, PATH_REPLACEMENT),
  );
};

const redactKeyValuePairs = (value: string) =>
  value
    .split("&")
    .map((pair) => {
      const [rawKey, ...rest] = pair.split("=");
      if (!rawKey) {
        return pair;
      }

      return SENSITIVE_KEY_PATTERN.test(decodeURIComponent(rawKey))
        ? `${rawKey}=${REDACTED_VALUE}`
        : [rawKey, ...rest].join("=");
    })
    .join("&");

const normalizeUrl = (value?: string | null) => {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return "";
  }

  const withoutOrigin = stripOrigin(trimmed);
  const [path, query] = withoutOrigin.split("?");
  if (!query) {
    return normalizePathLikeText(path);
  }

  return `${normalizePathLikeText(path)}?${redactKeyValuePairs(query)}`;
};

const redactUnknownValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactUnknownValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? REDACTED_VALUE
          : redactUnknownValue(inner),
      ]),
    );
  }

  if (typeof value === "string") {
    return normalizePathLikeText(value);
  }

  return value;
};

const normalizeHeaders = (headers?: Record<string, string>) => {
  if (!headers) {
    return undefined;
  }

  const nextHeaders = Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key)
          ? REDACTED_VALUE
          : normalizePathLikeText(value),
      ])
      .filter(([, value]) => Boolean(value)),
  );

  return Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined;
};

const normalizeBody = (body?: string) => {
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body);
    return truncateText(safeStringify(redactUnknownValue(parsed)));
  } catch {
    return truncateText(normalizePathLikeText(body));
  }
};

const normalizeRequest = (request?: PreviewSignalRequest) => {
  if (!request) {
    return undefined;
  }

  const nextRequest: PreviewSignalRequest = {
    method: normalizeWhitespace(request.method).toUpperCase() || undefined,
    url: normalizeUrl(request.url) || undefined,
    headers: normalizeHeaders(request.headers),
    body: normalizeBody(request.body),
  };

  return nextRequest.method || nextRequest.url || nextRequest.headers || nextRequest.body
    ? nextRequest
    : undefined;
};

const normalizeResponse = (response?: PreviewSignalResponse) => {
  if (!response) {
    return undefined;
  }

  const nextResponse: PreviewSignalResponse = {
    status: response.status,
    statusText: normalizeWhitespace(response.statusText) || undefined,
    body: normalizeBody(response.body),
  };

  return nextResponse.status || nextResponse.statusText || nextResponse.body
    ? nextResponse
    : undefined;
};

const extractTopStackFrame = (stack?: string) => {
  const trimmed = normalizePathLikeText(stack);
  if (!trimmed) {
    return "";
  }

  return trimmed.split("\n")[0]?.trim() ?? "";
};

const createTitle = (transport: PreviewSignalTransport) => {
  if (transport.title) {
    return normalizeWhitespace(transport.title);
  }

  if (transport.kind === "api") {
    const method = normalizeWhitespace(transport.request?.method).toUpperCase();
    const url = normalizeUrl(transport.request?.url);
    const status = transport.response?.status;
    if (method || url || status) {
      return [method, url, status ? `returned ${status}` : "failed"]
        .filter(Boolean)
        .join(" ");
    }

    return "Preview API request failed";
  }

  if (transport.kind === "console") {
    return "Console error in preview";
  }

  return "Runtime issue in preview";
};

const createSignature = (record: {
  kind: PreviewSignalKind;
  message: string;
  source: string;
  stack: string;
  request?: PreviewSignalRequest;
  response?: PreviewSignalResponse;
}) => {
  if (record.kind === "api") {
    return [
      record.kind,
      record.request?.method ?? "",
      record.request?.url ?? "",
      record.response?.status ?? "",
      record.message,
    ]
      .join("|")
      .toLowerCase();
  }

  return [
    record.kind,
    record.message,
    record.source,
    extractTopStackFrame(record.stack),
  ]
    .join("|")
    .toLowerCase();
};

export const normalizePreviewSignalTransport = (
  transport: PreviewSignalTransport,
  context: PreviewSignalContext,
): PreviewSignalRecord => {
  const timestamp = transport.timestamp ?? new Date().toISOString();
  const message = normalizePathLikeText(transport.message) || "Unknown issue";
  const source =
    transport.kind === "api"
      ? normalizeUrl(transport.request?.url) || normalizePathLikeText(transport.source)
      : normalizePathLikeText(transport.source);
  const stack = normalizePathLikeText(transport.stack);
  const request = normalizeRequest(transport.request);
  const response = normalizeResponse(transport.response);

  const recordBase = {
    kind: transport.kind,
    title: createTitle(transport) || "Preview signal",
    message,
    source,
    stack,
    request,
    response,
  };

  return {
    id: uuidv4(),
    signature: createSignature(recordBase),
    ...recordBase,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    count: 1,
    projectId: context.projectId,
    roomId: context.roomId,
    previewSessionId: context.previewSessionId,
    seen: false,
    reviewed: false,
    lastSentAt: null,
    occurrences: [{ timestamp, roomId: context.roomId }],
  };
};

export const buildSignalsRepairPrompt = (records: PreviewSignalRecord[]) => {
  const uniqueRecords = records.filter(
    (record, index) =>
      records.findIndex((candidate) => candidate.id === record.id) === index,
  );

  const details = uniqueRecords
    .map((record, index) => {
      const lines = [
        `Issue ${index + 1}: ${record.title}`,
        `Type: ${record.kind}`,
        `Occurrences: ${record.count}`,
        record.message ? `Message: ${record.message}` : "",
        record.source ? `Source: ${record.source}` : "",
        record.stack ? `Stack: ${record.stack}` : "",
        record.request?.method || record.request?.url
          ? `Request: ${[
              record.request?.method ?? "",
              record.request?.url ?? "",
            ]
              .filter(Boolean)
              .join(" ")}`
          : "",
        record.response?.status
          ? `Response: ${record.response.status}${record.response.statusText ? ` ${record.response.statusText}` : ""}`
          : "",
        record.request?.body ? `Request body: ${record.request.body}` : "",
        record.response?.body ? `Response body: ${record.response.body}` : "",
      ].filter(Boolean);

      return lines.join("\n");
    })
    .join("\n\n");

  return `I found these issues while testing the preview. Please diagnose and fix them.\n\n${details}`;
};

const readResponseBody = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text")) {
    return undefined;
  }

  try {
    return await response.clone().text();
  } catch {
    return undefined;
  }
};

type StructuredApiFailure = {
  title: string;
  message: string;
  responseBody?: string;
};

const parseJsonSafely = (value?: string) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const extractPixelReturnError = (payload: Record<string, unknown>) => {
  const pixelReturn = payload.pixelReturn;
  if (!Array.isArray(pixelReturn)) {
    return null;
  }

  for (const item of pixelReturn) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const operationType = Array.isArray((item as Record<string, unknown>).operationType)
      ? ((item as Record<string, unknown>).operationType as unknown[])
      : [];
    const hasErrorOperation = operationType.some(
      (entry) => String(entry).toUpperCase() === "ERROR",
    );
    if (!hasErrorOperation) {
      continue;
    }

    const output = normalizePathLikeText(
      typeof (item as Record<string, unknown>).output === "string"
        ? ((item as Record<string, unknown>).output as string)
        : safeStringify((item as Record<string, unknown>).output),
    );
    const pixelExpression = normalizePathLikeText(
      typeof (item as Record<string, unknown>).pixelExpression === "string"
        ? ((item as Record<string, unknown>).pixelExpression as string)
        : "",
    );

    return {
      title: "SEMOSS request returned an application error",
      message: output || "SEMOSS request returned an application error",
      responseBody: pixelExpression
        ? truncateText(`Pixel: ${pixelExpression}\n\nOutput: ${output}`)
        : output,
    };
  }

  return null;
};

const extractStructuredApiFailure = (
  status: number | undefined,
  statusText: string | undefined,
  body?: string,
) => {
  const parsed = parseJsonSafely(body);
  if (!parsed) {
    if (status && status >= 400) {
      return {
        title: "API request failed",
        message: normalizeWhitespace(statusText) || "Request failed",
        responseBody: body ? normalizeBody(body) : undefined,
      };
    }
    return null;
  }

  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    const message = parsed.errors
      .map((error) =>
        typeof error === "string"
          ? error
          : normalizePathLikeText(safeStringify(redactUnknownValue(error))),
      )
      .filter(Boolean)
      .join(" | ");

    return {
      title: "API request returned errors",
      message: message || normalizeWhitespace(statusText) || "Request failed",
      responseBody: normalizeBody(body),
    };
  }

  const pixelReturnError = extractPixelReturnError(parsed);
  if (pixelReturnError) {
    return pixelReturnError;
  }

  if (status && status >= 400) {
    return {
      title: "API request failed",
      message: normalizeWhitespace(statusText) || "Request failed",
      responseBody: normalizeBody(body),
    };
  }

  return null;
};

const serializeConsoleArgs = (args: unknown[]) =>
  normalizePathLikeText(
    args
      .map((arg) => {
        if (arg instanceof Error) {
          return arg.stack || arg.message;
        }

        if (typeof arg === "string") {
          return arg;
        }

        return safeStringify(redactUnknownValue(arg));
      })
      .join(" "),
  );

const extractErrorLike = (value: unknown) => {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === "string") {
    return {
      message: value,
      stack: "",
    };
  }

  return {
    message: safeStringify(redactUnknownValue(value)),
    stack: "",
  };
};

type PreviewWindowPatched = Window &
  typeof globalThis & {
    __agent47PreviewSignalsCleanup__?: () => void;
    __agent47PreviewSignalsPatched__?: boolean;
  };

export const attachPreviewSignals = (
  iframe: HTMLIFrameElement,
  handlers: {
    onSignal: (transport: PreviewSignalTransport) => void;
    onCapabilityChange?: (capability: PreviewSignalCapability) => void;
  },
) => {
  const previewWindow = iframe.contentWindow as PreviewWindowPatched | null;
  if (!previewWindow) {
    handlers.onCapabilityChange?.({
      status: "unavailable",
      message: "Live signals are unavailable until the preview loads.",
    });
    return () => undefined;
  }

  try {
    void previewWindow.document;
  } catch {
    handlers.onCapabilityChange?.({
      status: "unavailable",
      message: "Live signals are not available for this preview surface.",
    });
    return () => undefined;
  }

  if (previewWindow.__agent47PreviewSignalsCleanup__) {
    previewWindow.__agent47PreviewSignalsCleanup__();
  }

  const emit = (transport: PreviewSignalTransport) => {
    handlers.onSignal(transport);
  };

  const onError = (event: ErrorEvent) => {
    emit({
      kind: "runtime",
      title: "Runtime exception in preview",
      message: event.message || event.error?.message || "Unhandled runtime exception",
      source: event.filename,
      stack: event.error?.stack,
      timestamp: new Date().toISOString(),
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const details = extractErrorLike(event.reason);
    emit({
      kind: "runtime",
      title: "Unhandled promise rejection",
      message: details.message || "Unhandled promise rejection",
      stack: details.stack,
      timestamp: new Date().toISOString(),
    });
  };

  const originalConsoleError = previewWindow.console.error.bind(previewWindow.console);
  previewWindow.console.error = (...args: unknown[]) => {
    emit({
      kind: "console",
      title: "Console error in preview",
      message: serializeConsoleArgs(args) || "Console error",
      timestamp: new Date().toISOString(),
    });
    originalConsoleError(...args);
  };

  const originalFetch = previewWindow.fetch.bind(previewWindow);
  previewWindow.fetch = async (...args: Parameters<typeof fetch>) => {
    const requestInput = args[0];
    const init = args[1];
    const requestUrl =
      typeof requestInput === "string"
        ? requestInput
        : requestInput instanceof Request
          ? requestInput.url
          : String(requestInput);
    const method =
      init?.method ??
      (requestInput instanceof Request ? requestInput.method : "GET");
    const headers = Object.fromEntries(
      new Headers(
        init?.headers ??
          (requestInput instanceof Request ? requestInput.headers : undefined),
      ).entries(),
    );
    const body =
      typeof init?.body === "string"
        ? init.body
        : requestInput instanceof Request
          ? undefined
          : undefined;

    try {
      const response = await originalFetch(...args);
      const responseBody = await readResponseBody(response);
      const structuredFailure = extractStructuredApiFailure(
        response.status,
        response.statusText,
        responseBody,
      );
      if (!response.ok || structuredFailure) {
        emit({
          kind: "api",
          title:
            structuredFailure?.title ??
            `${method.toUpperCase()} ${normalizeUrl(requestUrl)} returned ${response.status}`,
          message:
            structuredFailure?.message ||
            response.statusText ||
            "Request failed",
          request: {
            method,
            url: requestUrl,
            headers,
            body,
          },
          response: {
            status: response.status,
            statusText: response.statusText,
            body: structuredFailure?.responseBody ?? responseBody,
          },
          timestamp: new Date().toISOString(),
        });
      }

      return response;
    } catch (error) {
      const details = extractErrorLike(error);
      emit({
        kind: "api",
        title: `${method.toUpperCase()} ${normalizeUrl(requestUrl)} failed`,
        message: details.message || "Network request failed",
        stack: details.stack,
        request: {
          method,
          url: requestUrl,
          headers,
          body,
        },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  };

  const xhrPrototype = previewWindow.XMLHttpRequest.prototype as XMLHttpRequest["prototype"] & {
    __agent47OriginalOpen__?: XMLHttpRequest["open"];
    __agent47OriginalSend__?: XMLHttpRequest["send"];
    __agent47OriginalSetRequestHeader__?: XMLHttpRequest["setRequestHeader"];
  };
  const originalOpen = xhrPrototype.open;
  const originalSend = xhrPrototype.send;
  const originalSetRequestHeader = xhrPrototype.setRequestHeader;

  xhrPrototype.open = function open(
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    (this as XMLHttpRequest & { __agent47SignalMeta__?: PreviewSignalRequest }).__agent47SignalMeta__ =
      {
        method,
        url: String(url),
        headers: {},
      };
    return originalOpen.call(this, method, url, ...(rest as []));
  };

  xhrPrototype.setRequestHeader = function setRequestHeader(
    header: string,
    value: string,
  ) {
    const meta = (this as XMLHttpRequest & { __agent47SignalMeta__?: PreviewSignalRequest })
      .__agent47SignalMeta__;
    if (meta) {
      meta.headers = {
        ...(meta.headers ?? {}),
        [header]: value,
      };
    }
    return originalSetRequestHeader.call(this, header, value);
  };

  xhrPrototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as XMLHttpRequest & {
      __agent47SignalMeta__?: PreviewSignalRequest;
      __agent47SignalCaptured__?: boolean;
    };
    if (xhr.__agent47SignalMeta__ && typeof body === "string") {
      xhr.__agent47SignalMeta__.body = body;
    }

    const emitXhrFailure = () => {
      if (xhr.__agent47SignalCaptured__) {
        return;
      }

      const responseBody =
        typeof xhr.responseText === "string" ? xhr.responseText : undefined;
      const structuredFailure = extractStructuredApiFailure(
        xhr.status || undefined,
        xhr.statusText,
        responseBody,
      );

      if (!structuredFailure && xhr.status < 400 && xhr.status !== 0) {
        return;
      }

      xhr.__agent47SignalCaptured__ = true;
      emit({
        kind: "api",
        title:
          structuredFailure?.title ??
          `${(xhr.__agent47SignalMeta__?.method ?? "GET").toUpperCase()} ${normalizeUrl(xhr.__agent47SignalMeta__?.url)} ${xhr.status ? `returned ${xhr.status}` : "failed"}`,
        message:
          structuredFailure?.message ||
          xhr.statusText ||
          (xhr.status === 0 ? "Network request failed" : "Request failed"),
        request: xhr.__agent47SignalMeta__,
        response: {
          status: xhr.status || undefined,
          statusText: xhr.statusText,
          body: structuredFailure?.responseBody ?? responseBody,
        },
        timestamp: new Date().toISOString(),
      });
    };

    xhr.addEventListener("loadend", emitXhrFailure, { once: true });
    xhr.addEventListener("error", emitXhrFailure, { once: true });

    return originalSend.call(xhr, body ?? null);
  };

  previewWindow.addEventListener("error", onError);
  previewWindow.addEventListener("unhandledrejection", onUnhandledRejection);

  const cleanup = () => {
    previewWindow.removeEventListener("error", onError);
    previewWindow.removeEventListener("unhandledrejection", onUnhandledRejection);
    previewWindow.console.error = originalConsoleError;
    previewWindow.fetch = originalFetch;
    xhrPrototype.open = originalOpen;
    xhrPrototype.send = originalSend;
    xhrPrototype.setRequestHeader = originalSetRequestHeader;
    previewWindow.__agent47PreviewSignalsCleanup__ = undefined;
    previewWindow.__agent47PreviewSignalsPatched__ = false;
  };

  previewWindow.__agent47PreviewSignalsCleanup__ = cleanup;
  previewWindow.__agent47PreviewSignalsPatched__ = true;
  handlers.onCapabilityChange?.({
    status: "ready",
    message: "Live signals are capturing preview issues while you test.",
  });

  return cleanup;
};

export const getSignalKindLabel = (kind: PreviewSignalKind) => {
  switch (kind) {
    case "api":
      return "API";
    case "console":
      return "Console";
    case "runtime":
    default:
      return "App";
  }
};

export const formatSignalTimestamp = (value?: string | null) => {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const limitOccurrences = (occurrences: PreviewSignalOccurrence[]) =>
  occurrences.slice(0, MAX_OCCURRENCES);

export const normalizePreviewIssueTransport = normalizePreviewSignalTransport;
export const buildIssuesRepairPrompt = buildSignalsRepairPrompt;
export const attachPreviewIssues = attachPreviewSignals;
export const getIssueKindLabel = getSignalKindLabel;
export const formatIssueTimestamp = formatSignalTimestamp;
export const limitIssueOccurrences = limitOccurrences;
