/**
 * Drizzle для таблиц операторского health (`operator_incidents`, `operator_job_status`).
 * Схема — единый пакет `@bersoncare/operator-db-schema`; миграции остаются в webapp Drizzle.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import { db } from './client.js';

const integratorDrizzleSchema = { operatorIncidents, operatorJobStatus };

export type IntegratorDrizzleDb = NodePgDatabase<typeof integratorDrizzleSchema>;

let cached: IntegratorDrizzleDb | null = null;

export function getIntegratorDrizzle(): IntegratorDrizzleDb {
  cached ??= drizzle(db, { schema: integratorDrizzleSchema });
  return cached;
}
