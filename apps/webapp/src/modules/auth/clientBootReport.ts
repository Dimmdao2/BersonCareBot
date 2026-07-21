import { z } from "zod";

export const CLIENT_BOOT_REPORT_MAX_BYTES = 4_096;

const clientEnvironmentSchema = z.object({
  osFamily: z.enum(["ios", "android", "windows", "macos", "linux", "unknown"]),
  osMajor: z.number().int().min(0).max(999).nullable(),
  browserFamily: z.enum(["safari", "chrome", "firefox", "samsung_internet", "edge", "other", "unknown"]),
  browserMajor: z.number().int().min(0).max(999).nullable(),
  supportBucket: z.enum(["below_matrix", "within_matrix", "unknown"]),
  isInAppWebView: z.boolean(),
}).strict();

const featureProbesSchema = z.object({
  fetch: z.boolean(),
  promise: z.boolean(),
  serviceWorker: z.boolean(),
  storageEstimate: z.boolean(),
}).strict();

const failureSignalsSchema = z.object({
  moduleExecuted: z.boolean(),
  reactMounted: z.boolean(),
  failureKind: z.enum(["module_never_executed", "module_executed_not_mounted"]),
  capturedError: z.enum(["none", "syntax_error", "script_load_error", "runtime_error", "unhandled_rejection"]),
  swState: z.enum(["unsupported", "available", "controlled", "registered", "registration_failed", "unknown"]),
  storageBucket: z.enum(["unsupported", "available", "near_quota", "unavailable", "unknown"]),
  featureProbes: featureProbesSchema,
}).strict();

export const clientBootReportSchema = z.object({
  entrySurface: z.enum(["tg", "max", "pwa", "browser"]),
  correlationId: z.string().min(16).max(80).regex(/^[A-Za-z0-9_-]+$/),
  timingMs: z.number().int().min(0).max(60_000),
  client: clientEnvironmentSchema,
  failureSignals: failureSignalsSchema,
}).strict();

export type ClientBootReport = z.infer<typeof clientBootReportSchema>;
