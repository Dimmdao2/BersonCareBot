import { Pool } from 'pg';
import type { PoolClient, PoolConfig } from 'pg';
import {
  applyDbPrincipalToConnection,
  assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  type DbPrincipal,
  getCurrentDbPrincipal,
  isWebappLockedInfraCronSource,
} from '@bersoncare/db-principal';
import { withPortContextTransaction } from '@bersoncare/db-principal';
import { reportSaasIsolationEventBestEffort } from '@/infra/saasIsolationReporterRuntime';
import { classifyPostgresIsolationDenial } from '@/infra/db/saasIsolationDbFailureReporting';
import { getCurrentWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import {
  type WebappPortContextRuntimeConfig,
  webappPortContextPrincipal,
} from '@/infra/db/portContextRuntime';

function currentWebappDbSourceOperation() {
  return getCurrentWebappDbOperationFamily() ?? 'webapp_db_request';
}

type WebappPoolProviderConfig = {
  connectionString?: string;
  staffConnectionString?: string;
  nonstaffConnectionString?: string;
  poolFactory?: (config: PoolConfig) => Pool;
  portContext?: WebappPortContextRuntimeConfig;
};

type WebappRuntimePoolKind = 'staff' | 'nonstaff';

export type WebappPoolRoutingMetrics = {
  staffSelections: number;
  nonstaffSelections: number;
  missingPrincipalSelections: number;
  bootstrapSelections: number;
  infraSelections: number;
};

const poolRoutingMetrics = new WeakMap<Pool, WebappPoolRoutingMetrics>();

function prepareWebappPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: future per-process DB principal setup belongs here.
}

function createWebappPool(
  connectionString: string,
  max: number,
  poolFactory: (config: PoolConfig) => Pool,
): Pool {
  const pool = poolFactory({
    connectionString,
    max,
  });
  const metrics = createEmptyRoutingMetrics();
  pool.on('connect', prepareWebappPoolClient);
  installPrincipalAwarePoolQuery(pool, metrics);
  poolRoutingMetrics.set(pool, metrics);
  return pool;
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

function installPrincipalAwarePoolQuery(pool: Pool, metrics: WebappPoolRoutingMetrics): void {
  const queryWithPrincipal = async (
    principalSnapshot: DbPrincipal | undefined,
    ...args: Parameters<Pool['query']>
  ): Promise<Awaited<ReturnType<Pool['query']>>> => {
    const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
    if (!principalSnapshot) metrics.missingPrincipalSelections += 1;
    try {
      assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(
        principalSnapshot,
        principalApplyOptions,
      );
    } catch (error) {
      void reportSaasIsolationEventBestEffort({
        eventClass: 'missing_principal',
        sourceService: 'webapp',
        sourceOperation: currentWebappDbSourceOperation(),
      });
      throw error;
    }
    const client = await pool.connect();
    try {
      try {
        await applyDbPrincipalToConnection(client, principalSnapshot, principalApplyOptions);
      } catch (error) {
        await reportSaasIsolationEventBestEffort({
          eventClass: 'invalid_signature_or_install',
          sourceService: 'webapp',
          sourceOperation: currentWebappDbSourceOperation(),
        });
        throw error;
      }
      const query = client.query.bind(client) as unknown as (
        ...innerArgs: Parameters<Pool['query']>
      ) => ReturnType<Pool['query']>;
      try {
        return await query(...args);
      } catch (error) {
        const eventClass = classifyPostgresIsolationDenial(error);
        if (eventClass) {
          await reportSaasIsolationEventBestEffort({
            eventClass,
            sourceService: 'webapp',
            sourceOperation: currentWebappDbSourceOperation(),
          });
        }
        throw error;
      }
    } finally {
      let cleanupError: unknown;
      try {
        await clearDbPrincipalFromConnection(client, principalApplyOptions, principalSnapshot);
      } catch (err) {
        cleanupError = err;
        await reportSaasIsolationEventBestEffort({
          eventClass: 'cleanup_failure',
          sourceService: 'webapp',
          sourceOperation: currentWebappDbSourceOperation(),
        });
        throw err;
      } finally {
        releasePoolClient(client, cleanupError);
      }
    }
  };

  pool.query = ((...args: Parameters<Pool['query']>) => {
    if (typeof args.at(-1) === 'function') {
      throw new Error('Callback-form pool.query is forbidden; use the promise-form DB chokepoint');
    }
    // One snapshot must drive both credential routing and role/context install across async checkout.
    return queryWithPrincipal(getCurrentDbPrincipal(), ...args);
  }) as unknown as Pool['query'];
}

function choosePoolKindForPrincipal(
  principal: DbPrincipal | undefined,
  metrics: WebappPoolRoutingMetrics,
): WebappRuntimePoolKind {
  // This is the routing decision, not an independent record of the pool checkout.
  // Actual role/pool failures are reported only from the PostgreSQL 42501 classifier.
  const poolKind: WebappRuntimePoolKind =
    principal?.kind === 'organization' ||
    principal?.kind === 'staff' ||
    principal?.kind === 'clinicBilling' ||
    principal?.kind === 'platform' ||
    (principal?.kind === 'infra' && isWebappLockedInfraCronSource(principal.source))
      ? 'staff'
      : 'nonstaff';

  if (poolKind === 'staff') {
    metrics.staffSelections += 1;
  } else {
    metrics.nonstaffSelections += 1;
  }

  if (!principal) {
    metrics.missingPrincipalSelections += 1;
  } else if (principal.kind === 'bootstrap') {
    metrics.bootstrapSelections += 1;
  } else if (principal.kind === 'infra') {
    metrics.infraSelections += 1;
  }

  return poolKind;
}

function assertRoutedWebappPoolCheckoutAllowed(
  principal: DbPrincipal | undefined,
  metrics: WebappPoolRoutingMetrics,
): void {
  const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);
  try {
    assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(principal, principalApplyOptions);
  } catch (error) {
    if (!principal) {
      metrics.missingPrincipalSelections += 1;
      void reportSaasIsolationEventBestEffort({
        eventClass: 'missing_principal',
        sourceService: 'webapp',
        sourceOperation: currentWebappDbSourceOperation(),
      });
    } else if (principal.kind === 'infra') {
      metrics.infraSelections += 1;
    }
    throw error;
  }
}

function createRoutedWebappPool(input: {
  staffPool: Pool;
  nonstaffPool: Pool;
  metrics: WebappPoolRoutingMetrics;
}): Pool {
  let routedPool: Pool;
  const selectPool = (principal: DbPrincipal | undefined): Pool => {
    assertRoutedWebappPoolCheckoutAllowed(principal, input.metrics);
    return choosePoolKindForPrincipal(principal, input.metrics) === 'staff'
      ? input.staffPool
      : input.nonstaffPool;
  };

  const routedConnect = (): Promise<PoolClient> => selectPool(getCurrentDbPrincipal()).connect();
  const routedQuery = async (
    ...args: Parameters<Pool['query']>
  ): Promise<Awaited<ReturnType<Pool['query']>>> => {
    // Do not re-read the mutable request cell between pool selection and the raw pool chokepoint.
    const principalSnapshot = getCurrentDbPrincipal();
    return selectPool(principalSnapshot).query(...args);
  };
  const routedEnd = async (): Promise<void> => {
    await Promise.all([input.staffPool.end(), input.nonstaffPool.end()]);
  };

  routedPool = new Proxy(input.nonstaffPool, {
    get(target, prop, receiver): unknown {
      switch (prop) {
        case 'connect':
          return routedConnect;
        case 'query':
          return routedQuery;
        case 'end':
          return routedEnd;
        case 'totalCount':
          return input.staffPool.totalCount + input.nonstaffPool.totalCount;
        case 'idleCount':
          return input.staffPool.idleCount + input.nonstaffPool.idleCount;
        case 'waitingCount':
          return input.staffPool.waitingCount + input.nonstaffPool.waitingCount;
        case 'on':
        case 'once':
        case 'off':
        case 'removeListener':
          return (...args: Parameters<Pool['on']>) => {
            const staffMethod = Reflect.get(input.staffPool, prop, input.staffPool);
            const nonstaffMethod = Reflect.get(input.nonstaffPool, prop, input.nonstaffPool);
            if (typeof staffMethod === 'function') {
              staffMethod.apply(input.staffPool, args);
            }
            if (typeof nonstaffMethod === 'function') {
              nonstaffMethod.apply(input.nonstaffPool, args);
            }
            return routedPool;
          };
        default:
          return Reflect.get(target, prop, receiver);
      }
    },
  }) as Pool;

  poolRoutingMetrics.set(routedPool, input.metrics);
  return routedPool;
}

function createEmptyRoutingMetrics(): WebappPoolRoutingMetrics {
  return {
    staffSelections: 0,
    nonstaffSelections: 0,
    missingPrincipalSelections: 0,
    bootstrapSelections: 0,
    infraSelections: 0,
  };
}

export function createWebappPoolProvider(config: WebappPoolProviderConfig): Pool {
  const poolFactory = config.poolFactory ?? ((poolConfig: PoolConfig) => new Pool(poolConfig));
  if (config.portContext) {
    return createPortContextWebappPool(config.portContext, poolFactory);
  }
  const singleConnectionString = config.connectionString?.trim();
  const staffConnectionString = config.staffConnectionString?.trim();
  const nonstaffConnectionString = config.nonstaffConnectionString?.trim();

  if (!staffConnectionString && !nonstaffConnectionString) {
    if (!singleConnectionString) {
      throw new Error('Webapp database connection string is not set');
    }
    return createWebappPool(singleConnectionString, 5, poolFactory);
  }

  const resolvedStaffConnectionString = staffConnectionString || singleConnectionString;
  const resolvedNonstaffConnectionString = nonstaffConnectionString || singleConnectionString;
  if (!resolvedStaffConnectionString || !resolvedNonstaffConnectionString) {
    throw new Error(
      'DATABASE_URL_STAFF and DATABASE_URL_NONSTAFF must both be set, or DATABASE_URL must be set as fallback',
    );
  }

  if (resolvedStaffConnectionString === resolvedNonstaffConnectionString) {
    return createWebappPool(resolvedStaffConnectionString, 5, poolFactory);
  }

  return createRoutedWebappPool({
    staffPool: createWebappPool(resolvedStaffConnectionString, 3, poolFactory),
    nonstaffPool: createWebappPool(resolvedNonstaffConnectionString, 2, poolFactory),
    metrics: createEmptyRoutingMetrics(),
  });
}

/**
 * Target runtime: the two webapp mTLS logins are physical pools, while every query is a freshly
 * installed transaction context. This path deliberately has no DATABASE_URL/nonstaff fallback.
 */
function createPortContextWebappPool(
  config: WebappPortContextRuntimeConfig,
  poolFactory: (config: PoolConfig) => Pool,
): Pool {
  const staffPool = poolFactory({ ...config.staff, max: 3 });
  const patientPool = poolFactory({ ...config.patient, max: 2 });
  const metrics = createEmptyRoutingMetrics();
  let routedPool: Pool;

  const select = () => {
    const selected = webappPortContextPrincipal(getCurrentDbPrincipal(), config.capabilities);
    if (selected.pool === 'staff') metrics.staffSelections += 1;
    else metrics.nonstaffSelections += 1;
    return { pool: selected.pool === 'staff' ? staffPool : patientPool, principal: selected.principal };
  };

  const query = async (...args: Parameters<Pool['query']>): Promise<Awaited<ReturnType<Pool['query']>>> => {
    if (typeof args.at(-1) === 'function') {
      throw new Error('Callback-form pool.query is forbidden; use the promise-form DB chokepoint');
    }
    const selected = select();
    const client = await selected.pool.connect();
    let completed = false;
    try {
      const result = await withPortContextTransaction(client, selected.principal, async (sameClient) => {
        const clientQuery = sameClient.query.bind(sameClient) as unknown as (
          ...queryArgs: Parameters<Pool['query']>
        ) => ReturnType<Pool['query']>;
        return clientQuery(...args);
      });
      completed = true;
      return result as Awaited<ReturnType<Pool['query']>>;
    } finally {
      // The shared wrapper destroys on every failure. A successful transaction is the only client
      // that may be returned to the pool.
      if (completed) client.release();
    }
  };

  routedPool = new Proxy(staffPool, {
    get(target, prop, receiver): unknown {
      if (prop === 'query') return query;
      if (prop === 'connect') {
        // Direct checkout is only consumed by withClient.ts, which applies the same wrapper.
        return () => select().pool.connect();
      }
      if (prop === 'end') return async () => Promise.all([staffPool.end(), patientPool.end()]);
      if (prop === 'totalCount') return staffPool.totalCount + patientPool.totalCount;
      if (prop === 'idleCount') return staffPool.idleCount + patientPool.idleCount;
      if (prop === 'waitingCount') return staffPool.waitingCount + patientPool.waitingCount;
      return Reflect.get(target, prop, receiver);
    },
  }) as Pool;
  poolRoutingMetrics.set(routedPool, metrics);
  return routedPool;
}

export function getWebappPoolRoutingMetrics(pool: Pool): WebappPoolRoutingMetrics | undefined {
  const metrics = poolRoutingMetrics.get(pool);
  return metrics === undefined ? undefined : { ...metrics };
}
