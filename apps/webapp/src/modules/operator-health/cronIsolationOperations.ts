import type { InternalHttpJobFamily } from '@/modules/operator-health/backgroundJobManifest';
import type { SaasIsolationSourceOperation } from '@/modules/operator-health/saasIsolationDiagnostics';

/**
 * Одна карта «семейство фонового задания → операция isolation telemetry».
 *
 * Ключи — union, выведенный из `BACKGROUND_JOB_MANIFEST`: новое `internal_http` семейство физически
 * не соберётся, пока у него нет своей операции. Так закрыт разрыв E3 сводного аудита 27.08.2026:
 * `maintenance` и `saas_billing` отсутствовали в рукописной карте, поэтому отказ записи их тика
 * оставался только `logger.warn` и не доходил до операторской телеметрии изоляции.
 */
export const MANIFEST_CRON_ISOLATION_OPERATIONS: Readonly<
  Record<InternalHttpJobFamily, SaasIsolationSourceOperation>
> = {
  health: 'cron_health',
  media: 'cron_media',
  analytics: 'cron_analytics',
  maintenance: 'cron_maintenance',
  saas_billing: 'cron_saas_billing',
};

/** Семейства заданий вне manifest вебаппа (integrator-сторона) сохраняют прежние операции. */
export const LEGACY_CRON_ISOLATION_OPERATIONS: Readonly<
  Record<string, SaasIsolationSourceOperation>
> = {
  reminders: 'cron_reminders',
  specialist_tasks: 'cron_specialist_tasks',
};

export function resolveCronIsolationOperation(
  jobFamily: string,
): SaasIsolationSourceOperation | undefined {
  const byManifest: Readonly<Record<string, SaasIsolationSourceOperation | undefined>> =
    MANIFEST_CRON_ISOLATION_OPERATIONS;
  return byManifest[jobFamily] ?? LEGACY_CRON_ISOLATION_OPERATIONS[jobFamily];
}
