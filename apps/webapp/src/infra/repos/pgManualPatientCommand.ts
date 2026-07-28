import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { stableStringifyForIdempotency } from '@/infra/idempotency/integratorEventSemanticHash';
import {
  manualPatientCommands,
  type ManualPatientCommandKind,
} from '../../../db/schema/manualPatientCommands';

export type ManualPatientCommand = typeof manualPatientCommands.$inferSelect;

export function manualPatientCommandFingerprint(semantic: unknown): string {
  return createHash('sha256').update(stableStringifyForIdempotency(semantic)).digest('hex');
}

/** UUIDs are globally unique commands: organization is payload authority, not part of the lock key. */
export async function lockManualPatientCommand(tx: DrizzleDb, commandId: string): Promise<void> {
  const key = `doctor-manual-patient:${commandId}`;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`);
}

export async function findManualPatientCommand(
  tx: DrizzleDb,
  commandId: string,
): Promise<ManualPatientCommand | null> {
  const [row] = await tx
    .select()
    .from(manualPatientCommands)
    .where(eq(manualPatientCommands.commandId, commandId))
    .limit(1);
  return row ?? null;
}

export function assertManualPatientCommandReplay(
  command: ManualPatientCommand,
  expected: {
    organizationId: string;
    commandKind: ManualPatientCommandKind;
    requestFingerprint: string;
  },
): void {
  if (
    command.organizationId !== expected.organizationId ||
    command.commandKind !== expected.commandKind ||
    command.requestFingerprint !== expected.requestFingerprint
  ) {
    throw new Error('idempotency_conflict');
  }
}

export async function insertManualPatientCommand(
  tx: DrizzleDb,
  input: {
    commandId: string;
    organizationId: string;
    commandKind: ManualPatientCommandKind;
    requestFingerprint: string;
    platformUserId: string;
  },
): Promise<void> {
  await tx.insert(manualPatientCommands).values(input);
}

export function isManualPatientCommandUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { code?: unknown; constraint?: unknown };
  return value.code === '23505' && value.constraint === 'manual_patient_commands_pkey';
}
