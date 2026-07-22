import {
  assertDevAuthBypassConfiguration,
  parseDevAuthBypassFlag,
} from "@/modules/auth/devBypassPolicy";

let captureNodeRequestError: ((error: unknown) => void) | null = null;

/**
 * Старт production-сервера без DATABASE_URL — явный сбой (не «тихие» in-memory репозитории).
 * `next build` и воркеры сборки не проходят через `npm_lifecycle_event === "start"` — не трогаем.
 */
export async function register(): Promise<void> {
  assertDevAuthBypassConfiguration({
    nodeEnv: process.env.NODE_ENV ?? "development",
    allowDevAuthBypass: parseDevAuthBypassFlag(process.env.ALLOW_DEV_AUTH_BYPASS),
  });

  if (
    process.env.NODE_ENV === "production"
    && !(process.env.DATABASE_URL ?? "").trim()
    && process.env.npm_lifecycle_event === "start"
  ) {
    throw new Error(
      "DATABASE_URL is not set. Production webapp requires a PostgreSQL connection string in the environment.",
    );
  }
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_RUNTIME !== "nodejs") return;
  const errorTracking = await import("@/app-layer/observability/errorTracking");
  await errorTracking.initWebappErrorTracking();
  captureNodeRequestError = errorTracking.captureWebappRequestError;
}

export function onRequestError(error: unknown): void {
  captureNodeRequestError?.(error);
}
