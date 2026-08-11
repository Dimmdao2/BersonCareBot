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
  rotatePortContextPool(
    next: IntegratorPortContextRuntimeConfig,
    drainTimeoutMs?: number,
  ): Promise<void>;
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
  type Generation = {
    config: IntegratorPortContextRuntimeConfig;
    pool: Pool;
    clients: Set<PoolClient>;
  };
  const listeners = new Set<(error: Error) => void>();
  const generations = new Set<Generation>();
  const wrappedClients = new WeakSet<PoolClient>();
  const createGeneration = (next: IntegratorPortContextRuntimeConfig): Generation => {
    const generation = {
      config: next,
      pool: poolFactory({ ...next.pool, max: 5 }),
      clients: new Set<PoolClient>(),
    };
    for (const listener of listeners) generation.pool.on('error', listener);
    generations.add(generation);
    return generation;
  };
  const checkout = async (generation: Generation): Promise<PoolClient> => {
    const client = await generation.pool.connect();
    generation.clients.add(client);
    if (!wrappedClients.has(client)) {
      const rawRelease = client.release.bind(client);
      client.release = ((error?: Error) => {
        generation.clients.delete(client);
        rawRelease(error);
      }) as PoolClient['release'];
      wrappedClients.add(client);
    }
    return client;
  };
  const preflight = async (generation: Generation): Promise<void> => {
    const client = await checkout(generation);
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  };
  const endGeneration = async (generation: Generation): Promise<void> => {
    try {
      await generation.pool.end();
    } finally {
      generations.delete(generation);
    }
  };
  const forceGeneration = (generation: Generation, error: Error): void => {
    for (const client of [...generation.clients]) client.release(error);
  };
  const awaitDrain = async (generation: Generation, timeoutMs: number): Promise<void> => {
    const ending = endGeneration(generation);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      ending.then(() => false),
      new Promise<true>((resolve) => {
        timer = setTimeout(() => resolve(true), timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (!timedOut) return;
    const error = new Error('port-context old integrator pool did not drain before timeout');
    forceGeneration(generation, error);
    let forcedTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ending,
        new Promise<never>((_, reject) => {
          forcedTimer = setTimeout(() => reject(error), timeoutMs);
        }),
      ]);
    } finally {
      if (forcedTimer) clearTimeout(forcedTimer);
    }
  };
  let active = createGeneration(config);
  const query = async (
    ...args: Parameters<Pool['query']>
  ): Promise<Awaited<ReturnType<Pool['query']>>> => {
    if (typeof args.at(-1) === 'function')
      throw new Error('Callback-form pool.query is forbidden; use the promise-form DB chokepoint');
    const selected = active;
    const execute = async (): Promise<Awaited<ReturnType<Pool['query']>>> => {
      const principal = integratorPortContextPrincipal(
        getCurrentDbPrincipal(),
        selected.config.capabilities,
      );
      const client = await checkout(selected);
      let completed = false;
      try {
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
    return execute();
  };
  const rotatePortContextPool = async (
    next: IntegratorPortContextRuntimeConfig,
    drainTimeoutMs = 30_000,
  ): Promise<void> => {
    if (!Number.isSafeInteger(drainTimeoutMs) || drainTimeoutMs < 1) {
      throw new Error('port-context pool drain timeout must be a positive integer');
    }
    const replacement = createGeneration(next);
    try {
      await preflight(replacement);
    } catch (error) {
      forceGeneration(replacement, error instanceof Error ? error : new Error(String(error)));
      await endGeneration(replacement).catch(() => undefined);
      throw error;
    }
    const previous = active;
    active = replacement;
    await awaitDrain(previous, drainTimeoutMs);
  };
  let proxy: IntegratorPortContextPool;
  proxy = new Proxy(active.pool, {
    get(target, prop, receiver): unknown {
      if (prop === 'query') return query;
      if (prop === 'connect') return () => checkout(active);
      if (prop === 'end')
        return () => Promise.all([...generations].map(endGeneration)).then(() => undefined);
      if (prop === 'rotatePortContextPool') return rotatePortContextPool;
      if (prop === 'on')
        return (event: string, listener: (error: Error) => void) => {
          if (event === 'error') {
            listeners.add(listener);
            for (const generation of generations) generation.pool.on('error', listener);
          }
          return proxy;
        };
      if (prop === 'off' || prop === 'removeListener')
        return (event: string, listener: (error: Error) => void) => {
          if (event === 'error') {
            listeners.delete(listener);
            for (const generation of generations) generation.pool.removeListener('error', listener);
          }
          return proxy;
        };
      return Reflect.get(target, prop, receiver);
    },
  }) as IntegratorPortContextPool;
  return proxy;
}

/** Dedicated true-global telemetry transport; intentionally bypasses request-principal installation. */
