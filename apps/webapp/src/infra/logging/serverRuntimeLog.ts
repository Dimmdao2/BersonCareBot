import { randomBytes } from "node:crypto";
import { logger, serializeError } from "./logger";

export type ServerRuntimeLogResult = {
  /** Короткий id для ссылки пользователем в поддержку; дублируется в JSON-логе. */
  digest: string;
  name: string;
  message: string;
};

/**
 * Структурированная запись через pino (journald/systemd на хосте подхватывает stderr).
 * Не логируйте секреты и полные connection string.
 */
export function logServerRuntimeError(
  scope: string,
  err: unknown,
  extra?: Record<string, string | number | boolean | undefined>,
): ServerRuntimeLogResult {
  const digest = randomBytes(4).toString("hex");
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);

  logger.error(
    {
      scope,
      digest,
      errName: name,
      // Raw `err.message` never goes into the log payload verbatim (same safe-by-construction
      // contract as `serializeError`/L1) — it is only returned to the caller below for a
      // dev-gated UI display, never logged.
      err: serializeError(err),
      ...extra,
    },
    "server_runtime_error",
  );

  return { digest, name, message };
}
