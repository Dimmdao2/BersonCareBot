import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import {
  applyCurrentDbPrincipalToConnection,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  setDbOperationalRuntimeRole,
} from '@bersoncare/db-principal';
import { assertMediaWorkerLockedPrincipalClassified } from './withClient.js';

type MediaWorkerPoolProviderConfig = {
  connectionString: string;
};

function prepareMediaWorkerPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: future per-process DB principal setup belongs here.
}

function toReleaseError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function releasePoolClient(client: PoolClient, cleanupError?: unknown): void {
  if (cleanupError === undefined) {
    client.release();
    return;
  }

  client.release(toReleaseError(cleanupError));
}

function installPrincipalAwarePoolQuery(pool: Pool): void {
  const queryWithPrincipal = async (
    ...args: Parameters<Pool['query']>
  ): Promise<Awaited<ReturnType<Pool['query']>>> => {
    const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
    assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);
    const client = await pool.connect();
    let result: Awaited<ReturnType<Pool['query']>> | undefined;
    let queryError: unknown;
    try {
      await applyCurrentDbPrincipalToConnection(client, principalApplyOptions);
      if (principalApplyOptions.mode === 'locked') {
        await setDbOperationalRuntimeRole(client, 'app_operational_media_worker');
      }
      const query = client.query.bind(client) as unknown as (
        ...innerArgs: Parameters<Pool['query']>
      ) => ReturnType<Pool['query']>;
      result = await query(...args);
    } catch (err) {
      queryError = err;
    }

    let cleanupError: unknown;
    try {
      await clearDbPrincipalFromConnection(client, principalApplyOptions);
    } catch (err) {
      cleanupError = err;
    }
    releasePoolClient(client, cleanupError);
    if (queryError !== undefined) {
      throw queryError;
    }
    if (cleanupError !== undefined) {
      throw cleanupError;
    }
    return result as Awaited<ReturnType<Pool['query']>>;
  };

  pool.query = ((...args: Parameters<Pool['query']>) => {
    if (typeof args.at(-1) === 'function') {
      throw new Error('Callback-form pool.query is forbidden; use the promise-form DB chokepoint');
    }
    return queryWithPrincipal(...args);
  }) as unknown as Pool['query'];
}

export function createMediaWorkerPoolProvider(config: MediaWorkerPoolProviderConfig): Pool {
  const pool = new Pool({ connectionString: config.connectionString, max: 4 });
  pool.on('connect', prepareMediaWorkerPoolClient);
  installPrincipalAwarePoolQuery(pool);
  return pool;
}

/** Dedicated true-global telemetry transport; intentionally bypasses job-principal installation. */
export function createMediaWorkerSaasIsolationTelemetryPoolProvider(
  connectionString: string,
): Pool {
  return new Pool({
    connectionString,
    max: 1,
    application_name: 'bcb_media_worker_saas_telemetry',
    connectionTimeoutMillis: 250,
    query_timeout: 200,
    statement_timeout: 200,
  });
}
