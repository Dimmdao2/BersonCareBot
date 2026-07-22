import { execFileSync } from "node:child_process";

import type {
  ErrorTrackingCapturePoint,
  ErrorTrackingInitInput,
  ErrorTrackingInitResult,
  ErrorTrackingProcessRole,
  ErrorTrackingService,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

export type ErrorTrackingSdkAdapter = Readonly<{
  init(options: UnknownRecord): void;
  captureException(error: unknown, hint: Readonly<{ tags: Readonly<{ capture_point: string }> }>): string;
  flush(timeoutMs: number): PromiseLike<boolean> | boolean;
  close(timeoutMs: number): PromiseLike<boolean> | boolean;
}>;

type ErrorTrackingSdkInitOptions = Readonly<{
  dsn: string;
  release: string;
  enabled: true;
  defaultIntegrations: false;
  integrations: readonly [];
  tracesSampleRate: 0;
  profilesSampleRate: 0;
  enableLogs: false;
  autoSessionTracking: false;
  sendDefaultPii: false;
  includeLocalVariables: false;
  attachStacktrace: false;
  maxBreadcrumbs: 0;
  sendClientReports: false;
  debug: false;
  beforeBreadcrumb(): null;
  beforeSend(event: unknown): UnknownRecord;
}>;

type ActiveState = Readonly<{
  sdk: ErrorTrackingSdkAdapter;
  service: ErrorTrackingService;
  processRole: ErrorTrackingProcessRole;
  release: string;
}>;

const MAX_RELEASE_LENGTH = 128;
const MAX_FRAME_COUNT = 40;
const MAX_FRAME_PATH_LENGTH = 240;
const VALID_CAPTURE_POINTS: ReadonlySet<string> = new Set<ErrorTrackingCapturePoint>([
  "webapp_request_error",
  "integrator_http_error",
  "integrator_startup_fatal",
  "worker_loop_error",
  "worker_startup_fatal",
  "scheduler_loop_error",
  "scheduler_startup_fatal",
  "media_worker_loop_error",
  "media_worker_startup_fatal",
]);

let activeState: ActiveState | null = null;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedRelease(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > MAX_RELEASE_LENGTH) return null;
  if (!/^[A-Za-z0-9._:@/+\-]+$/.test(normalized)) return null;
  return normalized;
}

export function resolveErrorTrackingRelease(input: Readonly<{
  buildId?: string | null;
  nodeEnv?: string | null;
  cwd?: string;
}> = {}): string {
  const buildId = boundedRelease(input.buildId ?? process.env.BUILD_ID);
  if (buildId) return buildId;

  try {
    const gitSha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: input.cwd ?? process.cwd(),
      encoding: "utf8",
      timeout: 250,
      maxBuffer: 256,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[0-9a-f]{7,12}$/i.test(gitSha)) return gitSha.toLowerCase();
  } catch {
    // A source checkout is not guaranteed in standalone/runtime images.
  }

  return (input.nodeEnv ?? process.env.NODE_ENV) === "development" ? "dev" : "unknown";
}

function validSentryDsn(value: string | null): string | null {
  const raw = value?.trim() ?? "";
  if (!raw || raw.length > 2_048) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || !parsed.username || parsed.search || parsed.hash) return null;
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0 || !/^[A-Za-z0-9_-]+$/.test(pathParts.at(-1) ?? "")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeExceptionType(value: unknown): string {
  if (typeof value !== "string") return "Error";
  const normalized = value.trim().slice(0, 80);
  return /^[A-Za-z_$][A-Za-z0-9_.$-]*$/.test(normalized) ? normalized : "Error";
}

function repoRelativeFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replaceAll("\\", "/").split(/[?#]/, 1)[0] ?? "";
  const match = normalized.match(/(?:^|\/)(apps|packages|scripts)\/([^\s]+)$/);
  if (!match) return null;
  const relative = `${match[1]}/${match[2]}`;
  if (relative.includes("../") || relative.includes("node_modules/") || relative.length > MAX_FRAME_PATH_LENGTH) {
    return null;
  }
  return relative;
}

function boundedPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 10_000_000) return undefined;
  return value;
}

function sanitizedFunctionName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 100);
  return normalized && /^[A-Za-z0-9_.$<>-]+$/.test(normalized) ? normalized : undefined;
}

function sanitizeFrames(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return [];
  const frames: UnknownRecord[] = [];
  for (const candidate of value.slice(-MAX_FRAME_COUNT)) {
    if (!isRecord(candidate)) continue;
    const filename = repoRelativeFilename(candidate.filename);
    if (!filename) continue;
    const frame: UnknownRecord = { filename, in_app: true };
    const functionName = sanitizedFunctionName(candidate.function);
    const lineno = boundedPositiveInteger(candidate.lineno);
    const colno = boundedPositiveInteger(candidate.colno);
    if (functionName) frame.function = functionName;
    if (lineno) frame.lineno = lineno;
    if (colno) frame.colno = colno;
    frames.push(frame);
  }
  return frames;
}

function firstException(event: UnknownRecord): UnknownRecord {
  if (!isRecord(event.exception)) return {};
  const values = event.exception.values;
  if (!Array.isArray(values) || !isRecord(values[0])) return {};
  return values[0];
}

function capturePointFromEvent(event: UnknownRecord): ErrorTrackingCapturePoint {
  const candidate = isRecord(event.tags) ? event.tags.capture_point : null;
  return typeof candidate === "string" && VALID_CAPTURE_POINTS.has(candidate)
    ? candidate as ErrorTrackingCapturePoint
    : "integrator_startup_fatal";
}

export function sanitizeErrorTrackingEvent(
  event: unknown,
  fixed: Readonly<{
    service: ErrorTrackingService;
    processRole: ErrorTrackingProcessRole;
    release: string;
  }>,
): UnknownRecord {
  const sourceEvent = isRecord(event) ? event : {};
  const sourceException = firstException(sourceEvent);
  const sourceStacktrace = isRecord(sourceException.stacktrace) ? sourceException.stacktrace : {};
  const frames = sanitizeFrames(sourceStacktrace.frames);
  const exception: UnknownRecord = {
    type: sanitizeExceptionType(sourceException.type),
    value: "[REDACTED]",
  };
  if (frames.length > 0) exception.stacktrace = { frames };

  const sanitized: UnknownRecord = {
    exception: { values: [exception] },
    release: fixed.release,
    tags: {
      service: fixed.service,
      process_role: fixed.processRole,
      capture_point: capturePointFromEvent(sourceEvent),
      release: fixed.release,
    },
  };
  return sanitized;
}

async function loadNodeSdk(): Promise<ErrorTrackingSdkAdapter> {
  const sdk = await import("@sentry/node");
  return {
    init(options) {
      sdk.init(options as Parameters<typeof sdk.init>[0]);
    },
    captureException(error, hint) {
      return sdk.captureException(error, hint);
    },
    flush(timeoutMs) {
      return sdk.flush(timeoutMs);
    },
    close(timeoutMs) {
      return sdk.close(timeoutMs);
    },
  };
}

export async function initErrorTrackingWithLoader(
  input: ErrorTrackingInitInput,
  loadSdk: () => Promise<ErrorTrackingSdkAdapter>,
): Promise<ErrorTrackingInitResult> {
  const release = resolveErrorTrackingRelease(input);
  if (!input.enabled) return { enabled: false, release, reason: "disabled" };
  const dsn = validSentryDsn(input.dsn);
  if (!dsn) return { enabled: false, release, reason: "invalid_dsn" };
  if (activeState) return { enabled: true, release: activeState.release };

  try {
    const sdk = await loadSdk();
    const fixed = { service: input.service, processRole: input.processRole, release } as const;
    const options: ErrorTrackingSdkInitOptions = {
      dsn,
      release,
      enabled: true,
      defaultIntegrations: false,
      integrations: [],
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      enableLogs: false,
      autoSessionTracking: false,
      sendDefaultPii: false,
      includeLocalVariables: false,
      attachStacktrace: false,
      maxBreadcrumbs: 0,
      sendClientReports: false,
      debug: false,
      beforeBreadcrumb: () => null,
      beforeSend: (event: unknown) => sanitizeErrorTrackingEvent(event, fixed),
    };
    sdk.init(options);
    activeState = { sdk, ...fixed };
    return { enabled: true, release };
  } catch {
    activeState = null;
    return { enabled: false, release, reason: "sdk_unavailable" };
  }
}

export function initErrorTracking(input: ErrorTrackingInitInput): Promise<ErrorTrackingInitResult> {
  return initErrorTrackingWithLoader(input, loadNodeSdk);
}

export function captureErrorTrackingException(error: unknown, capturePoint: ErrorTrackingCapturePoint): void {
  activeState?.sdk.captureException(error, { tags: { capture_point: capturePoint } });
}

export async function flushErrorTracking(timeoutMs = 1_500): Promise<boolean> {
  if (!activeState) return true;
  const boundedTimeout = Math.min(5_000, Math.max(50, Math.trunc(timeoutMs)));
  try {
    return await activeState.sdk.flush(boundedTimeout);
  } catch {
    return false;
  }
}

export async function closeErrorTracking(timeoutMs = 1_500): Promise<boolean> {
  const state = activeState;
  activeState = null;
  if (!state) return true;
  const boundedTimeout = Math.min(5_000, Math.max(50, Math.trunc(timeoutMs)));
  try {
    return await state.sdk.close(boundedTimeout);
  } catch {
    return false;
  }
}
