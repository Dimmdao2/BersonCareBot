import pino from "pino";
import type { MediaWorkerEnv } from "./env.js";

export function createLogger(env: Pick<MediaWorkerEnv, "LOG_LEVEL">) {
  return pino({ level: env.LOG_LEVEL || "info" });
}

export type Logger = ReturnType<typeof createLogger>;
