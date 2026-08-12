import {
  assertDevAuthBypassConfiguration,
  parseDevAuthBypassFlag,
} from '@/modules/auth/devBypassPolicy';

let captureNodeRequestError: ((error: unknown) => void) | null = null;

/**
 * Старт production-сервера без DATABASE_URL — явный сбой (не «тихие» in-memory репозитории).
 * `next build` и воркеры сборки не проходят через `npm_lifecycle_event === "start"` — не трогаем.
 */
export async function register(): Promise<void> {
  assertDevAuthBypassConfiguration({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    allowDevAuthBypass: parseDevAuthBypassFlag(process.env.ALLOW_DEV_AUTH_BYPASS),
  });

  const portContext = process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context';
  const runtimeDatabaseConfigured = portContext
    ? Boolean(
        (process.env.DATABASE_URL_STAFF ?? '').trim() &&
        (process.env.DATABASE_URL_PATIENT ?? '').trim() &&
        (process.env.DATABASE_URL_GLOBAL_ADMIN ?? '').trim(),
      )
    : Boolean((process.env.DATABASE_URL ?? '').trim());
  if (
    process.env.NODE_ENV === 'production' &&
    !runtimeDatabaseConfigured &&
    process.env.npm_lifecycle_event === 'start'
  ) {
    throw new Error(
      portContext
        ? 'DATABASE_URL_STAFF, DATABASE_URL_PATIENT and DATABASE_URL_GLOBAL_ADMIN are required in webapp port-context mode.'
        : 'DATABASE_URL is not set. Production webapp requires a PostgreSQL connection string in the environment.',
    );
  }
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // Schema/session-revocation verification is deploy-only in the mTLS runtime. A boot-time raw
  // connection would be a third DB door before a declared capability exists.
  // Next.js compiles this file for both the Node.js and Edge runtimes. This exact
  // `if (process.env.NEXT_RUNTIME === "nodejs") { await import(...) }` shape is the
  // documented pattern Next statically recognizes to exclude the branch — and its
  // Node-only transitive deps (dotenv, pg, Sentry) — from the Edge compilation.
  // See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#specifying-the-runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installWebappPortContextRotationSignal } = await import('@/infra/db/client');
    installWebappPortContextRotationSignal();
    const { ensureAuthModulePortsBound } = await import('@/app-layer/di/bindAuthModulePorts');
    ensureAuthModulePortsBound();
    const { ensureSystemSettingsConfigAdapterBound } =
      await import('@/app-layer/di/bindSystemSettingsConfigAdapter');
    ensureSystemSettingsConfigAdapterBound();
    const errorTracking = await import('@/app-layer/observability/errorTracking');
    await errorTracking.initWebappErrorTracking();
    captureNodeRequestError = errorTracking.captureWebappRequestError;
  }
}

export function onRequestError(error: unknown): void {
  captureNodeRequestError?.(error);
}
