import type { Pool } from 'pg';
import { getPool } from '@/infra/db/client';

export function getSaasIsolationEventWriterPool(): Pool {
  return getPool();
}

export function getSaasIsolationOperatorPool(): Pool {
  return getPool();
}
