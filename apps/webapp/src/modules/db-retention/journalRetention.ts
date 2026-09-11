import type { JournalRetentionPort } from '@/modules/db-retention/ports';

/**
 * Recorded windows are declared alongside the exhaustive lifecycle registry. Every target here goes through
 * the one existing chokepoint
 * (`app.prune_retention_target` / the dedicated `app.prune_context_nonce_ledger` root) — no parallel
 * prune mechanism, no per-table service. The DB capability arrives via `JournalRetentionPort`
 * (injected by the caller through `buildAppDeps()`), not by importing infra directly.
 */
export const CONTEXT_NONCE_LEDGER_GRACE_SEC_DEFAULT = 60 * 60; // 1 hour (formal minimum is 300s)
export const CONTEXT_NONCE_LEDGER_LIMIT_DEFAULT = 200_000;
export const IDEMPOTENCY_KEYS_RETENTION_DAYS_DEFAULT = 1; // expired + 24h
export const OUTGOING_DELIVERY_QUEUE_SENT_RETENTION_DAYS_DEFAULT = 30;
export const OUTGOING_DELIVERY_QUEUE_DEAD_RETENTION_DAYS_DEFAULT = 180;
export const NOTIFICATION_DELIVERY_ATTEMPTS_RETENTION_DAYS_DEFAULT = 180;
/**
 * `message_log` holds the doctor→patient message TEXT plus its delivery error. The recorded policy
 * already names this class: journals carrying the content of a message sent to a person keep 90 days
 * (`integrator.delivery_attempt_logs`, `public.support_delivery_events`). Placing the table in the class the
 * policy defines; no new policy is invented here.
 */
export const MESSAGE_LOG_RETENTION_DAYS_DEFAULT = 90;

/**
 * #1088. Окно истории напоминаний было открытым вопросом владельцу (`OQ-REMINDER-HISTORY-WINDOW`):
 * механика, ветка, ограниченный батч и объявленная поверхность стояли готовыми, не было числа.
 * Владелец 12.09 закрыл вопрос, не называя его сам: «История напоминаний, ну, посмотри, как это
 * делают другие… ну, не знаю, но месяц, блядь, ну, сколько хранить?» и следом «Надо решить, блядь,
 * сколько это хранят, просто. Нормальная, ребята, ну, как бы, взрослые систем, блядь, так и
 * настроить, так и сделать».
 *
 * 90 дней — не новое правило, а уже принятый в этом файле класс: журнал, несущий то, что было
 * ОТПРАВЛЕНО ЧЕЛОВЕКУ (`message_log`, `integrator.delivery_attempt_logs`,
 * `public.support_delivery_events`). Строка занятия напоминания — ровно это: что и когда человеку
 * показали. Верхняя граница названного владельцем диапазона («месяц… три»), не выше.
 *
 * Удаляются ТОЛЬКО терминальные занятия (`sent`/`failed`/`skipped`); `planned`/`queued` — незаконченная
 * работа, её возраст не трогает.
 */
export const REMINDER_OCCURRENCE_HISTORY_RETENTION_DAYS_DEFAULT = 90;

/**
 * #1088 (`OQ-TERMINAL-UPLOAD-SESSION-WINDOW`). Владелец 12.09, дословно: «Завершенные загрузки
 * файлов, блядь, что значит сроки хранения? Мы уже решили, что файлы мы не удаляем… Не трогаем
 * файлы… у нас же есть отметка о том, чей это файл, кто его загрузил… Ну, давай год хранить».
 *
 * Здесь не удаляется ни один файл: строка `media_upload_sessions` — бухгалтерия ПЕРЕДАЧИ
 * (`s3_key` + `upload_id`), а отметка «кто загрузил» живёт в `media_files.uploaded_by` и не
 * стареет никогда. Подметается только `completed`: у остальных терминальных состояний строка —
 * единственный держатель личности незавершённой загрузки в S3, и она уходит каскадом со своей
 * `media_files`, когда отмена подтверждена.
 */
export const MEDIA_UPLOAD_SESSIONS_COMPLETED_RETENTION_DAYS_DEFAULT = 365;

/**
 * #1088 (`OQ-SAAS-ISOLATION-EVENTS-WINDOW`). Телеметрия нарушения изоляции арендаторов — журнал
 * БЕЗОПАСНОСТИ: общепринятый нижний порог для такого журнала — год (PCI DSS 10.7 требует года, из
 * которого квартал должен быть немедленно доступен; того же года просят киберстраховщики).
 *
 * Возраст считается от `resolved_at`, и НЕРАЗОБРАННОЕ не удаляется никогда: строка здесь
 * дедуплицирована по `fingerprint` и живёт как открытый случай, а не как сырое событие. Почасовая
 * свёртка уходит каскадом. Тем же окном подметается журнал прогонов проверки покрытия.
 */
export const SAAS_ISOLATION_EVENTS_RETENTION_DAYS_DEFAULT = 365;

export type JournalRetentionTargetResult = {
  target: string;
  deleted: number;
};

export type JournalRetentionRunResult = {
  dryRun: boolean;
  results: JournalRetentionTargetResult[];
};

export type JournalRetentionOverrides = {
  dryRun?: boolean;
  contextNonceLedgerGraceSec?: number;
  contextNonceLedgerLimit?: number;
  idempotencyKeysRetentionDays?: number;
  outgoingDeliveryQueueSentRetentionDays?: number;
  outgoingDeliveryQueueDeadRetentionDays?: number;
  notificationDeliveryAttemptsRetentionDays?: number;
  messageLogRetentionDays?: number;
  reminderOccurrenceHistoryRetentionDays?: number;
  mediaUploadSessionsCompletedRetentionDays?: number;
  saasIsolationEventsRetentionDays?: number;
};

function clampContextNonceLedgerGraceSec(graceSec: number): number {
  return Math.min(86400, Math.max(0, Math.trunc(graceSec)));
}

function clampContextNonceLedgerLimit(limit: number): number {
  return Math.min(500_000, Math.max(1, Math.trunc(limit)));
}

function clampRetentionDays(retentionDays: number): number {
  return Math.min(3650, Math.max(1, Math.trunc(retentionDays)));
}

/**
 * Runs every still-live, still-unpruned journal target in one tick. Each target is independent —
 * one target failing does not stop the others; failures are collected and rethrown together so the
 * caller can report a partial success accurately instead of losing which targets actually ran.
 */
export async function runDbJournalRetention(
  port: JournalRetentionPort,
  overrides: JournalRetentionOverrides = {},
): Promise<JournalRetentionRunResult> {
  const dryRun = overrides.dryRun === true;
  const graceSec = clampContextNonceLedgerGraceSec(
    overrides.contextNonceLedgerGraceSec ?? CONTEXT_NONCE_LEDGER_GRACE_SEC_DEFAULT,
  );
  const limit = clampContextNonceLedgerLimit(
    overrides.contextNonceLedgerLimit ?? CONTEXT_NONCE_LEDGER_LIMIT_DEFAULT,
  );
  const idempotencyDays = clampRetentionDays(
    overrides.idempotencyKeysRetentionDays ?? IDEMPOTENCY_KEYS_RETENTION_DAYS_DEFAULT,
  );
  const sentDays = clampRetentionDays(
    overrides.outgoingDeliveryQueueSentRetentionDays ??
      OUTGOING_DELIVERY_QUEUE_SENT_RETENTION_DAYS_DEFAULT,
  );
  const deadDays = clampRetentionDays(
    overrides.outgoingDeliveryQueueDeadRetentionDays ??
      OUTGOING_DELIVERY_QUEUE_DEAD_RETENTION_DAYS_DEFAULT,
  );
  const notificationDays = clampRetentionDays(
    overrides.notificationDeliveryAttemptsRetentionDays ??
      NOTIFICATION_DELIVERY_ATTEMPTS_RETENTION_DAYS_DEFAULT,
  );
  const messageLogDays = clampRetentionDays(
    overrides.messageLogRetentionDays ?? MESSAGE_LOG_RETENTION_DAYS_DEFAULT,
  );
  const reminderHistoryDays = clampRetentionDays(
    overrides.reminderOccurrenceHistoryRetentionDays ??
      REMINDER_OCCURRENCE_HISTORY_RETENTION_DAYS_DEFAULT,
  );
  const uploadSessionDays = clampRetentionDays(
    overrides.mediaUploadSessionsCompletedRetentionDays ??
      MEDIA_UPLOAD_SESSIONS_COMPLETED_RETENTION_DAYS_DEFAULT,
  );
  const isolationDays = clampRetentionDays(
    overrides.saasIsolationEventsRetentionDays ?? SAAS_ISOLATION_EVENTS_RETENTION_DAYS_DEFAULT,
  );

  const steps: Array<{
    target: string;
    run: () => Promise<{ deleted: number }>;
  }> = [
    {
      target: 'app.context_nonce_ledger',
      run: () => port.pruneContextNonceLedger(graceSec, limit, { dryRun }),
    },
    {
      target: 'public_idempotency_keys',
      run: () => port.prunePublicIdempotencyKeys(idempotencyDays, { dryRun }),
    },
    {
      target: 'integrator_idempotency_keys',
      run: () => port.pruneIntegratorIdempotencyKeys(idempotencyDays, { dryRun }),
    },
    {
      target: 'outgoing_delivery_queue_sent',
      run: () => port.pruneOutgoingDeliveryQueueSent(sentDays, { dryRun }),
    },
    {
      target: 'outgoing_delivery_queue_dead',
      run: () => port.pruneOutgoingDeliveryQueueDead(deadDays, { dryRun }),
    },
    {
      target: 'notification_delivery_attempts',
      run: () => port.pruneNotificationDeliveryAttempts(notificationDays, { dryRun }),
    },
    {
      target: 'message_log',
      run: () => port.pruneMessageLog(messageLogDays, { dryRun }),
    },
    {
      target: 'reminder_occurrence_history_terminal',
      run: () => port.pruneReminderOccurrenceHistoryTerminal(reminderHistoryDays, { dryRun }),
    },
    {
      target: 'media_upload_sessions_completed',
      run: () => port.pruneMediaUploadSessionsCompleted(uploadSessionDays, { dryRun }),
    },
    {
      target: 'saas_isolation_events_resolved',
      run: () => port.pruneSaasIsolationEventsResolved(isolationDays, { dryRun }),
    },
    {
      target: 'saas_isolation_coverage_runs',
      run: () => port.pruneSaasIsolationCoverageRuns(isolationDays, { dryRun }),
    },
  ];

  const results: JournalRetentionTargetResult[] = [];
  const errors: Array<{ target: string; error: unknown }> = [];
  for (const step of steps) {
    try {
      const { deleted } = await step.run();
      results.push({ target: step.target, deleted });
    } catch (error) {
      errors.push({ target: step.target, error });
    }
  }

  if (errors.length > 0) {
    const message = errors
      .map(({ target, error }) => `${target}: ${error instanceof Error ? error.message : String(error)}`)
      .join('; ');
    throw new Error(
      `db_journal_retention: ${errors.length}/${steps.length} targets failed (${message}); ` +
        `${results.length} succeeded: ${results.map((r) => r.target).join(', ') || 'none'}`,
    );
  }

  return { dryRun, results };
}
