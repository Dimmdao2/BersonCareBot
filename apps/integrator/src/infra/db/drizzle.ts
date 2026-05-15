/**
 * Drizzle для таблиц операторского health и P1 product-таблиц `public`.
 * Схема операторских таблиц — `@bersoncare/operator-db-schema`; product — локально (`integratorDrizzleSchema.ts`).
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DbPort } from '../../kernel/contracts/index.js';
import { db } from './client.js';
import { integratorDrizzleSchema } from './integratorDrizzleSchema.js';

export type IntegratorDrizzleDb = NodePgDatabase<typeof integratorDrizzleSchema>;

let cached: IntegratorDrizzleDb | null = null;

export function getIntegratorDrizzle(): IntegratorDrizzleDb {
  cached ??= drizzle(db, { schema: integratorDrizzleSchema });
  return cached;
}

/**
 * Тот же пул, что у `db`, либо Drizzle-сессия активной транзакции `createDbPort().tx`
 * (см. `integratorDrizzle` на `DbPort`).
 */
export function getIntegratorDrizzleSession(port: DbPort): IntegratorDrizzleDb {
  const withSession = port as DbPort & { integratorDrizzle?: IntegratorDrizzleDb };
  return withSession.integratorDrizzle ?? getIntegratorDrizzle();
}
