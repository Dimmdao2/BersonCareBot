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

  if (
    process.env.NODE_ENV === 'production' &&
    !(process.env.DATABASE_URL ?? '').trim() &&
    process.env.npm_lifecycle_event === 'start'
  ) {
    throw new Error(
      'DATABASE_URL is not set. Production webapp requires a PostgreSQL connection string in the environment.',
    );
  }
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // D1 (C-1, 2026-07-26): refuse to start against a database that is behind this build. Session
  // revocation compares `platform_users.session_epoch` on every request and fails closed, so a
  // missing column is a total outage that presents as "every login returns 401". Fail here, once,
  // with a message that names the migration — see modules/auth/sessionRevocationSchema.ts for why an
  // UNREACHABLE database is explicitly not fatal.
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (databaseUrl && process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertSessionRevocationSchema } =
      await import('@/modules/auth/sessionRevocationSchema');
    const { probeSessionRevocationColumn } = await import('@/app-layer/db/bootProbe');
    await assertSessionRevocationSchema(() => probeSessionRevocationColumn(databaseUrl));
  }
  // Next.js compiles this file for both the Node.js and Edge runtimes. This exact
  // `if (process.env.NEXT_RUNTIME === "nodejs") { await import(...) }` shape is the
  // documented pattern Next statically recognizes to exclude the branch — and its
  // Node-only transitive deps (dotenv, pg, Sentry) — from the Edge compilation.
  // See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#specifying-the-runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
