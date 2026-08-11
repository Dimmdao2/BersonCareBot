import type { Pool, PoolClient } from 'pg';
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  getCurrentDbPrincipal,
  setDbOperationalRuntimeRole,
  type DbPrincipal,
  type DbPrincipalApplyOptions,
} from '@bersoncare/db-principal';
import { startPortContextTransaction, withPortContextTransaction } from '@bersoncare/db-principal';
import {
  createIntegratorPortContextRuntimeConfig,
  integratorPortContextPrincipal,
} from './portContextRuntime.js';

function isPortContextMode(): boolean {
  return process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context';
}

function currentPortContextPrincipal() {
  const config = createIntegratorPortContextRuntimeConfig(process.env);
  return integratorPortContextPrincipal(getCurrentDbPrincipal(), config.capabilities);
}

async function withPortContextPoolTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let completed = false;
  try {
    const result = await withPortContextTransaction(client, currentPortContextPrincipal(), async (sameClient) =>
      fn(sameClient as PoolClient),
    );
    completed = true;
    return result;
  } finally {
    if (completed) client.release();
  }
}

/** Bounded session resource for the scheduler's declared advisory-lock capability. */
export async function checkoutIntegratorPortContextSession(pool: Pool): Promise<{
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}> {
  if (!isPortContextMode()) throw new Error('Port-context scheduler session requested outside port-context mode');
  const client = await pool.connect();
  const handle = await startPortContextTransaction(client, currentPortContextPrincipal());
  return {
    client: handle.client as PoolClient,
    commit: () => handle.commit(),
    rollback: () => handle.rollback(),
    release: () => handle.release(),
  };
}

const principalApplyOptionsByClient = new WeakMap<PoolClient, DbPrincipalApplyOptions>();
const allowedLockedBootstrapSources = new Set([
  'integrator-deployment-org-resolution',
  'integrator-server-runtime-config',
  'integrator-user-org-resolution',
  'max-webhook:pre-routing',
  'max-webhook:unresolved-org',
  'max-webhook:verbose-config',
  'telegram-webhook:clear-menu-unresolved-org',
  'telegram-webhook:pre-routing',
  'telegram-webhook:unresolved-org',
]);
const allowedLockedInfraSources = new Set([
  'delivery-handler',
  'integrator-health-check',
  'integrator-projection-health',
  'max-webhook:record-outcome',
  'scheduler:acquire-lock',
  'scheduler:claim-due-jobs',
  'scheduler:handle-tick-event',
  'telegram-webhook:record-outcome',
  'worker:job-queue-drain',
  'worker:outgoing-delivery-tick',
  'worker:projection-outbox-tick',
]);

export type IntegratorTechnicalRuntimeRole =
  | 'app_operational_diagnostic'
  | 'app_operational_delivery_worker'
  | 'app_operational_scheduler';

const diagnosticInfraSources = new Set(['integrator-projection-health']);
const workerInfraSources = new Set([
  'worker:job-queue-drain',
  'worker:outgoing-delivery-tick',
  'worker:projection-outbox-tick',
]);
const schedulerInfraSources = new Set([
  'scheduler:acquire-lock',
  'scheduler:claim-due-jobs',
  'scheduler:handle-tick-event',
]);

export function getCurrentIntegratorTechnicalRuntimeRole():
  | IntegratorTechnicalRuntimeRole
  | undefined {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind !== 'infra') return undefined;
  const source = principal.source ?? '';
  if (diagnosticInfraSources.has(source)) return 'app_operational_diagnostic';
  if (workerInfraSources.has(source)) return 'app_operational_delivery_worker';
  if (schedulerInfraSources.has(source)) return 'app_operational_scheduler';
  return undefined;
}

export async function prepareIntegratorTechnicalPoolClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  if (options.mode !== 'locked') return;
  const role = getCurrentIntegratorTechnicalRuntimeRole();
  if (role !== undefined) await setDbOperationalRuntimeRole(client, role);
}

function getDbPrincipalApplyOptions(): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptionsFromEnv(process.env);
}

function rememberPreparedClient(client: PoolClient, options: DbPrincipalApplyOptions): void {
  principalApplyOptionsByClient.set(client, options);
}

function forgetPreparedClient(client: PoolClient): void {
  principalApplyOptionsByClient.delete(client);
}

function getPreparedClientOptions(client: PoolClient): DbPrincipalApplyOptions {
  return principalApplyOptionsByClient.get(client) ?? getDbPrincipalApplyOptions();
}

function toReleaseError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function assertAllowedTechnicalPrincipal(principal: DbPrincipal): void {
  const source = principal.source ?? '';
  if (principal.kind === 'bootstrap' && !allowedLockedBootstrapSources.has(source)) {
    throw new Error(
      `DB bootstrap principal source is not allowed on integrator request pool in locked mode: ${source || 'missing'}`,
    );
  }
  if (principal.kind === 'infra' && !allowedLockedInfraSources.has(source)) {
    throw new Error(
      `DB infra principal source is not allowed on integrator request pool in locked mode: ${source || 'missing'}`,
    );
  }
}

export function assertIntegratorLockedPrincipalClassified(options: DbPrincipalApplyOptions): void {
  if (options.mode !== 'locked') {
    return;
  }
  const principal = getCurrentDbPrincipal();
  if (!principal) {
    throw new Error(
      'DB principal context is required before integrator scoped DB access in locked mode',
    );
  }
  assertAllowedTechnicalPrincipal(principal);
}

async function prepareIntegratorClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client, options);
  await prepareIntegratorTechnicalPoolClient(client, options);
  rememberPreparedClient(client, options);
}

export async function prepareIntegratorTransactionClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions = getPreparedClientOptions(client),
): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client, options);
  await prepareIntegratorTechnicalPoolClient(client, options);
}

export async function releasePreparedIntegratorClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions = getPreparedClientOptions(client),
): Promise<void> {
  let cleanupError: unknown;
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    cleanupError = err;
    throw err;
  } finally {
    forgetPreparedClient(client);
    if (cleanupError === undefined) {
      client.release();
    } else {
      client.release(toReleaseError(cleanupError));
    }
  }
}

export async function destroyPreparedIntegratorClient(
  client: PoolClient,
  err: unknown,
): Promise<void> {
  forgetPreparedClient(client);
  const releaseWithError = client.release as unknown as (releaseError?: Error) => void;
  releaseWithError(toReleaseError(err));
}

async function releasePreparedIntegratorClientAfterSetupFailure(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    await destroyPreparedIntegratorClient(client, err);
    return;
  }
  try {
    forgetPreparedClient(client);
    client.release();
  } catch {
    /* release is synchronous in pg; keep setup failure if a mock throws */
  }
}

export async function checkoutIntegratorPoolClient(pool: Pool): Promise<PoolClient> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  assertIntegratorLockedPrincipalClassified(principalApplyOptions);
  const client = await pool.connect();
  try {
    await prepareIntegratorClient(client, principalApplyOptions);
    return client;
  } catch (err) {
    await releasePreparedIntegratorClientAfterSetupFailure(client, principalApplyOptions);
    throw err;
  }
}

export async function withIntegratorPoolClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (isPortContextMode()) return withPortContextPoolTransaction(pool, fn);
  const client = await checkoutIntegratorPoolClient(pool);
  try {
    return await fn(client);
  } finally {
    await releasePreparedIntegratorClient(client);
  }
}

export async function withIntegratorPoolTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (isPortContextMode()) return withPortContextPoolTransaction(pool, fn);
  const principalApplyOptions = getDbPrincipalApplyOptions();
  assertIntegratorLockedPrincipalClassified(principalApplyOptions);
  const client = await pool.connect();
  try {
    await prepareIntegratorClient(client, principalApplyOptions);
    await client.query('BEGIN');
    await prepareIntegratorTransactionClient(client, principalApplyOptions);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* preserve original error */
    }
    throw err;
  } finally {
    await releasePreparedIntegratorClient(client, principalApplyOptions);
  }
}
