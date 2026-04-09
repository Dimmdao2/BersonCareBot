import pino from "pino";
import { randomUUID } from "node:crypto";
import { env } from "@/config/env";

/** Unified error shape for pino serializers (aligned with integrator). */
export type SerializedError = {
  type: string;
  message: string;
  stack: string | undefined;
  cause?: unknown;
};

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return {
      type: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    };
  }

  if (typeof err === "object" && err !== null) {
    const e = err as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown };
    return {
      type: typeof e.name === "string" ? e.name : "ErrorLike",
      message: typeof e.message === "string" ? e.message : JSON.stringify(err),
      stack: typeof e.stack === "string" ? e.stack : undefined,
      cause: e.cause,
    };
  }

  return { type: "UnknownError", message: String(err), stack: undefined };
}

function buildTransport(): pino.TransportSingleOptions | undefined {
  const isDev = env.NODE_ENV === "development";
  const isTest = env.NODE_ENV === "test";
  if (!isDev || isTest) return undefined;

  return {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:standard" },
  };
}

const transport = buildTransport();

/** Root logger: JSON in prod/test, pretty in development. */
export const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  ...(transport ? { transport } : {}),
  base: { service: "bersoncare-webapp", pid: process.pid },
  redact: {
    paths: [
      "headers.authorization",
      "headers.cookie",
      "headers.x-*-secret-token",
      "*.authorization",
      "*.token",
      "*.secret",
      "*.apikey",
      "*.apiKey",
      "*.password",
      "*.phone",
      "*.phone_number",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: serializeError,
    error: serializeError,
  },
});

export function newEventId(prefix = "evt"): string {
  return `${prefix}_${randomUUID()}`;
}

export function getRequestLogger(requestId: string, context?: Record<string, string>) {
  return logger.child({ requestId, ...(context ?? {}) });
}
