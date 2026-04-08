/**
 * Старт production-сервера без DATABASE_URL — явный сбой (не «тихие» in-memory репозитории).
 * `next build` и воркеры сборки не проходят через `npm_lifecycle_event === "start"` — не трогаем.
 */
export function register(): void {
  if (process.env.NODE_ENV !== "production") return;
  if ((process.env.DATABASE_URL ?? "").trim()) return;
  if (process.env.npm_lifecycle_event !== "start") return;
  throw new Error(
    "DATABASE_URL is not set. Production webapp requires a PostgreSQL connection string in the environment.",
  );
}
