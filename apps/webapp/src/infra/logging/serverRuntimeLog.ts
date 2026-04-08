import { randomBytes } from "node:crypto";

export type ServerRuntimeLogResult = {
  /** Короткий id для ссылки пользователем в поддержку; дублируется в JSON-логе. */
  digest: string;
  name: string;
  message: string;
};

/**
 * Структурированная запись в stderr (journald/systemd на хосте подхватывает как есть).
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

  const line = JSON.stringify({
    level: "error",
    service: "bersoncare-webapp",
    scope,
    digest,
    errName: name,
    errMessage: message,
    ts: new Date().toISOString(),
    ...extra,
  });
  console.error(line);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  return { digest, name, message };
}
