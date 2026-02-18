import pino from "pino";

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
  const isDev = process.env.NODE_ENV === "development";
  const isTest = process.env.NODE_ENV === "test";
  if (!isDev || isTest) return undefined;

  return {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:standard" },
  };
}

const transport = buildTransport();

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(transport ? { transport } : {}),
  base: { pid: process.pid, hostname: process.env.HOSTNAME || "" },
  serializers: {
    err: serializeError,
    error: serializeError,
  },
});
