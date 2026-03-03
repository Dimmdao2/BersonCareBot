import type { OrchestratorResult, Script, ScriptContext } from '../contracts/index.js';
import type { DbReadQuery, DbWriteMutation, OutgoingIntent } from '../contracts/index.js';
import { executeStep } from '../domain/index.js';

function asDbWrites(data: Record<string, unknown> | undefined): DbWriteMutation[] {
  const writes = data?.writes;
  return Array.isArray(writes) ? (writes as DbWriteMutation[]) : [];
}

function asDbReads(data: Record<string, unknown> | undefined): DbReadQuery[] {
  const reads = data?.reads;
  return Array.isArray(reads) ? (reads as DbReadQuery[]) : [];
}

function asOutgoing(data: Record<string, unknown> | undefined): OutgoingIntent[] {
  const outgoing = data?.outgoing;
  return Array.isArray(outgoing) ? (outgoing as OutgoingIntent[]) : [];
}

/**
 * Запускает скрипт пошагово.
 * Базовая реализация: sequential step execution через `domain.executeStep`.
 */
export async function runScript(script: Script, ctx: ScriptContext): Promise<OrchestratorResult> {
  const reads: DbReadQuery[] = [];
  const writes: DbWriteMutation[] = [];
  const outgoing: OutgoingIntent[] = [];

  for (const step of script.steps) {
    const result = await executeStep(step, ctx);
    reads.push(...asDbReads(result.data));
    writes.push(...asDbWrites(result.data));
    outgoing.push(...asOutgoing(result.data));

    if (result.status === 'failed') break;
  }

  return { reads, writes, outgoing };
}
