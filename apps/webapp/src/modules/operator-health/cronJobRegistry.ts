import {
  BACKGROUND_JOB_MANIFEST,
  type BackgroundJobEnvironmentId,
  type BackgroundJobManifestEntry,
} from '@/modules/operator-health/backgroundJobManifest';

export type CronJobRegistryKind = BackgroundJobManifestEntry['kind'];

export type CronJobRegistryEntry = {
  id: string;
  jobFamily: string;
  jobKey: string;
  label: string;
  scheduleHint: string;
  /** После этого интервала без успешного tick — degraded. */
  staleAfterSec: number;
  kind: CronJobRegistryKind;
  internalPath?: string;
  /**
   * Нет строки в `operator_job_status` — только «нет данных» по задаче.
   * Не ухудшает сводный статус «Cron-задачи хоста» (редкое расписание, опциональный job).
   */
  optionalNoData?: boolean;
};

/**
 * Канонический список host cron / internal jobs для «Здоровье системы».
 *
 * Больше не рукописная копия: проекция единственного typed manifest
 * (`backgroundJobManifest.ts`), из которого генерируются и host artifacts, и deploy-сверка.
 * Реестр здоровья и поставляемое расписание физически не могут разойтись.
 */
export const CRON_JOB_REGISTRY: readonly CronJobRegistryEntry[] = BACKGROUND_JOB_MANIFEST.map(
  (entry) => ({
    id: entry.id,
    jobFamily: entry.jobFamily,
    jobKey: entry.jobKey,
    label: entry.label,
    scheduleHint: entry.scheduleHint,
    staleAfterSec: entry.staleAfterSec,
    kind: entry.kind,
    ...(entry.route ? { internalPath: entry.route.path } : {}),
    ...(entry.optionalNoData ? { optionalNoData: true } : {}),
  }),
);

export function cronJobRegistryForEnvironment(
  environmentId: BackgroundJobEnvironmentId,
): readonly CronJobRegistryEntry[] {
  return CRON_JOB_REGISTRY.filter((entry) => {
    const manifestEntry = BACKGROUND_JOB_MANIFEST.find((candidate) => candidate.id === entry.id);
    return !manifestEntry?.environments || manifestEntry.environments.includes(environmentId);
  });
}

export function findCronJobRegistryEntry(
  jobFamily: string,
  jobKey: string,
): CronJobRegistryEntry | undefined {
  return CRON_JOB_REGISTRY.find((e) => e.jobFamily === jobFamily && e.jobKey === jobKey);
}
