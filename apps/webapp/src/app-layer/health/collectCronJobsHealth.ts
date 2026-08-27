import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  classifyOperatorCronJobHealth,
  type OperatorCronJobHealthReason,
} from '@/modules/operator-health/classifyOperatorCronJobHealthStatus';
import {
  CRON_JOB_REGISTRY,
  findCronJobRegistryEntry,
  type CronJobRegistryEntry,
} from '@/modules/operator-health/cronJobRegistry';
import { OPERATOR_BACKUP_JOB_FAMILY } from '@/modules/operator-health/reconcileJobKeys';
import type { OperatorJobStatusTickRow } from '@/modules/operator-health/ports';

export type CronJobLastTickPayload = {
  jobKey: string;
  jobFamily: string;
  lastStatus: string;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  metaJson: Record<string, unknown>;
};

export type CronJobHealthItem = {
  id: string;
  jobFamily: string;
  jobKey: string;
  label: string;
  scheduleHint: string;
  kind: CronJobRegistryEntry['kind'];
  internalPath?: string;
  status: 'ok' | 'degraded' | 'error' | 'no_data';
  /**
   * Что именно наблюдалось: `never_run` / `stale` / `last_run_failed` / `success`.
   * Сводный `status` их схлопывает, поэтому оператор без этого поля не отличает
   * «никогда не запускалось» от «просрочено» (этап 2 сводного аудита 27.08.2026).
   */
  reason: OperatorCronJobHealthReason;
  lastTick: CronJobLastTickPayload | null;
};

type BackupJobHealthSlice = {
  lastStatus: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
};

export type CronJobsHealthPayload = {
  status: 'ok' | 'degraded' | 'error' | 'no_data';
  jobs: CronJobHealthItem[];
};

function backupRowToTick(jobKey: string, row: BackupJobHealthSlice): CronJobLastTickPayload {
  return {
    jobKey,
    jobFamily: OPERATOR_BACKUP_JOB_FAMILY,
    lastStatus: row.lastStatus,
    lastFinishedAt: row.lastFinishedAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    lastDurationMs: row.lastDurationMs,
    lastError: row.lastError,
    metaJson: {},
  };
}

function tickRowToPayload(row: OperatorJobStatusTickRow): CronJobLastTickPayload {
  return {
    jobKey: row.jobKey,
    jobFamily: row.jobFamily,
    lastStatus: row.lastStatus,
    lastFinishedAt: row.lastFinishedAt,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    lastDurationMs: row.lastDurationMs,
    lastError: row.lastError,
    metaJson: row.metaJson,
  };
}

function aggregateCronJobsStatus(jobs: CronJobHealthItem[]): CronJobsHealthPayload['status'] {
  if (jobs.length === 0) return 'no_data';
  let rank = 0;
  const bump = (to: number) => {
    if (to > rank) rank = to;
  };
  for (const j of jobs) {
    const reg = findCronJobRegistryEntry(j.jobFamily, j.jobKey);
    if (j.status === 'error') bump(2);
    else if (j.status === 'degraded') bump(1);
    else if (j.status === 'no_data' && !reg?.optionalNoData) bump(1);
  }
  if (rank >= 2) return 'error';
  if (rank >= 1) return 'degraded';
  return 'ok';
}

/**
 * Собирает статусы всех зарегистрированных host cron из `operator_job_status`.
 */
export async function collectCronJobsHealth(input?: {
  backupJobs?: Record<string, BackupJobHealthSlice>;
  /** Curated, already-redacted rows supplied by protected System Health diagnostics. */
  jobRows?: OperatorJobStatusTickRow[];
}): Promise<CronJobsHealthPayload> {
  const read = input?.jobRows ? null : buildAppDeps().operatorHealthRead;
  const backupByKey = input?.backupJobs ?? {};
  const curatedByKey = input?.jobRows
    ? new Map(input.jobRows.map((row) => [`${row.jobFamily}:${row.jobKey}`, row]))
    : null;

  const jobs: CronJobHealthItem[] = [];

  for (const entry of CRON_JOB_REGISTRY) {
    let lastTick: CronJobLastTickPayload | null = null;

    if (entry.kind === 'backup_shell') {
      const row = backupByKey[entry.jobKey];
      if (row) {
        lastTick = backupRowToTick(entry.jobKey, row);
      }
    } else {
      const row = curatedByKey
        ? (curatedByKey.get(`${entry.jobFamily}:${entry.jobKey}`) ?? null)
        : await read!.getOperatorJobStatus(entry.jobFamily, entry.jobKey);
      if (row) {
        lastTick = tickRowToPayload(row);
      }
    }

    const verdict = classifyOperatorCronJobHealth({
      lastStatus: lastTick?.lastStatus ?? null,
      lastSuccessAt: lastTick?.lastSuccessAt ?? null,
      lastFailureAt: lastTick?.lastFailureAt ?? null,
      staleAfterSec: entry.staleAfterSec,
    });

    jobs.push({
      id: entry.id,
      jobFamily: entry.jobFamily,
      jobKey: entry.jobKey,
      label: entry.label,
      scheduleHint: entry.scheduleHint,
      kind: entry.kind,
      internalPath: entry.internalPath,
      status: verdict.status,
      reason: verdict.reason,
      lastTick,
    });
  }

  return {
    status: aggregateCronJobsStatus(jobs),
    jobs,
  };
}
