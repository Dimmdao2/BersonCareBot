export type OperatorCronJobHealthSignals = {
  lastStatus: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  staleAfterSec: number;
  /** For tests; defaults to `Date.now()`. */
  nowMs?: number;
};

export type OperatorCronJobHealthStatus = 'ok' | 'degraded' | 'error' | 'no_data';

/**
 * Четыре различимых исхода наблюдения за фоновым заданием (этап 2 сводного аудита 27.08.2026).
 * Раньше `no_data` означало сразу и «никогда не запускалось», и «оператор ещё не установил
 * расписание», а «просрочено» было неотличимо от «последний запуск упал давно».
 */
export type OperatorCronJobHealthReason =
  /** Строки в `operator_job_status` нет вообще: задание ни разу не отработало. */
  | 'never_run'
  /** Последний зафиксированный запуск — неуспешный. */
  | 'last_run_failed'
  /** Успех был, но старше собственного SLA свежести задания. */
  | 'stale'
  /** Свежий успешный запуск. */
  | 'success';

export type OperatorCronJobHealthVerdict = {
  status: OperatorCronJobHealthStatus;
  reason: OperatorCronJobHealthReason;
};

/**
 * Универсальный статус periodic job по `operator_job_status` и SLA свежести.
 */
export function classifyOperatorCronJobHealth(
  s: OperatorCronJobHealthSignals,
): OperatorCronJobHealthVerdict {
  if (s.lastStatus == null && s.lastSuccessAt == null && s.lastFailureAt == null) {
    return { status: 'no_data', reason: 'never_run' };
  }

  const successMs = s.lastSuccessAt ? new Date(s.lastSuccessAt).getTime() : NaN;
  const failureMs = s.lastFailureAt ? new Date(s.lastFailureAt).getTime() : NaN;

  const failedLast =
    s.lastStatus === 'failure' ||
    (Number.isFinite(failureMs) && (!Number.isFinite(successMs) || failureMs > successMs));
  if (failedLast) {
    return { status: 'error', reason: 'last_run_failed' };
  }

  const nowMs = s.nowMs ?? Date.now();
  if (Number.isFinite(successMs)) {
    const ageSec = (nowMs - successMs) / 1000;
    if (ageSec > s.staleAfterSec) return { status: 'degraded', reason: 'stale' };
    return { status: 'ok', reason: 'success' };
  }

  // Строка есть, но подтверждённого успеха в ней нет — это ещё не отказ, но и не здоровье.
  return { status: 'degraded', reason: 'stale' };
}

/** Совместимый вход для читателей, которым нужен только сводный статус. */
export function classifyOperatorCronJobHealthStatus(
  s: OperatorCronJobHealthSignals,
): OperatorCronJobHealthStatus {
  return classifyOperatorCronJobHealth(s).status;
}
