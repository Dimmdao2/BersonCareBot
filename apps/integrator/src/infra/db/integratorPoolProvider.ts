import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import {
  applyCurrentDbPrincipalToConnection,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
} from '@bersoncare/db-principal';
import { getCurrentDbPrincipal, withPortContextTransaction } from '@bersoncare/db-principal';
import {
  assertIntegratorLockedPrincipalClassified,
  prepareIntegratorTechnicalPoolClient,
} from './withClient.js';
import {
  integratorPortContextPrincipal,
  type IntegratorPortContextRuntimeConfig,
} from './portContextRuntime.js';

type IntegratorPoolProviderConfig = {
  connectionString: string;
  poolFactory?: (config: PoolConfig) => Pool;
  portContext?: IntegratorPortContextRuntimeConfig;
};

export type IntegratorPortContextPool = Pool & {
  rotatePortContextPool(next: IntegratorPortContextRuntimeConfig, drainTimeoutMs?: number): Promise<void>;
};

function prepareIntegratorPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: future per-process DB principal setup belongs here.
}

function releasePoolClient(client: PoolClient, cleanupError?: unknown): void {
  if (cleanupError === undefined) {
    client.release();
    return;
  }

  client.release(
    cleanupError instanceof Error ? cleanupError : new Error('DB principal cleanup failed'),
  );
}

function installPrincipalAwarePoolQuery(pool: Pool): void {
  const queryWithPrincipal = async (
    ...args: Parameters<Pool['query']>
  ): Promise<Awaited<ReturnType<Pool['query']>>> => {
    const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
    assertIntegratorLockedPrincipalClassified(principalApplyOptions);
    const client = await pool.connect();
    let queryError: unknown;
    let result: Awaited<ReturnType<Pool['query']>> | undefined;
    try {
      await applyCurrentDbPrincipalToConnection(client, principalApplyOptions);
      await prepareIntegratorTechnicalPoolClient(client, principalApplyOptions);
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

export function createIntegratorPoolProvider(config: IntegratorPoolProviderConfig): Pool {
  const poolFactory = config.poolFactory ?? ((poolConfig: PoolConfig) => new Pool(poolConfig));
  if (config.portContext) return createPortContextIntegratorPool(config.portContext, poolFactory);
  const createPool = (connectionString: string, max: number): Pool => {
    const pool = poolFactory({ connectionString, max });
    pool.on('connect', prepareIntegratorPoolClient);
    installPrincipalAwarePoolQuery(pool);
    return pool;
  };
  return createPool(config.connectionString, 5);
}

/** Target runtime has exactly one integrator physical mTLS pool. */
function createPortContextIntegratorPool(
  config: IntegratorPortContextRuntimeConfig,
  poolFactory: (config: PoolConfig) => Pool,
): IntegratorPortContextPool {
  let active = { config, pool: poolFactory({ ...config.pool, max: 5 }) };
  const query = async (...args: Parameters<Pool['query']>): Promise<Awaited<ReturnType<Pool['query']>>> => {
    if (typeof args.at(-1) === 'function') throw new Error('Callback-form pool.query is forbidden; use the promise-form DB chokepoint');
    const selected = active;
    const client = await selected.pool.connect();
    let completed = false;
    try {
      const principal = integratorPortContextPrincipal(getCurrentDbPrincipal(), selected.config.capabilities);
      const result = await withPortContextTransaction(client, principal, async (sameClient) => {
        const clientQuery = sameClient.query.bind(sameClient) as unknown as (
          ...queryArgs: Parameters<Pool['query']>
        ) => ReturnType<Pool['query']>;
        return clientQuery(...args);
      });
      completed = true;
      return result as Awaited<ReturnType<Pool['query']>>;
    } finally {
      if (completed) client.release();
    }
  };
  const rotatePortContextPool = async (
    next: IntegratorPortContextRuntimeConfig,
    drainTimeoutMs = 30_000,
  ): Promise<void> => {
    if (!Number.isSafeInteger(drainTimeoutMs) || drainTimeoutMs < 1) {
      throw new Error('port-context pool drain timeout must be a positive integer');
    }
    const replacement = { config: next, pool: poolFactory({ ...next.pool, max: 5 }) };
    const previous = active;
    active = replacement;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error('port-context old integrator pool did not drain before timeout')),
        drainTimeoutMs,
      );
    });
    try {
      await Promise.race([previous.pool.end(), timeout]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
  };
  return new Proxy(active.pool, {
    get(target, prop, receiver): unknown {
      if (prop === 'query') return query;
      if (prop === 'connect') return () => active.pool.connect();
      if (prop === 'end') return () => active.pool.end();
      if (prop === 'rotatePortContextPool') return rotatePortContextPool;
      return Reflect.get(target, prop, receiver);
    },
  }) as IntegratorPortContextPool;
}

/** Dedicated true-global telemetry transport; intentionally bypasses request-principal installation. */
