import type { Pool } from 'pg';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';

const TELEMETRY_SOURCE = 'webapp-saas-isolation-telemetry';

function principalBoundPool(): Pool {
  const pool = getPool();
  return new Proxy(pool, {
    get(target, property, receiver): unknown {
      if (property === 'query') {
        return (...args: Parameters<Pool['query']>) =>
          runWithDbInfraPrincipal({ source: TELEMETRY_SOURCE }, () => target.query(...args));
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export function getSaasIsolationEventWriterPool(): Pool {
  return principalBoundPool();
}

export function getSaasIsolationOperatorPool(): Pool {
  return principalBoundPool();
}
