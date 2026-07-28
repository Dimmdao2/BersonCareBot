import type { OperatorAlertBlock } from './operatorHealthAlertConfig';

export type OperatorAlertDedupPort = {
  wasSentWithinHours(dedupKey: string, hours: number): Promise<boolean>;
  recordSent(input: { dedupKey: string; severity: OperatorAlertBlock }): Promise<void>;
  /** Последняя отправка по префиксу `dedup_key` (для UI «Последняя сводка»). */
  getLatestSentAtByDedupKeyPrefix(prefix: string): Promise<string | null>;
};

/**
 * C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): operator-alert recipients, resolved
 * from who currently holds the admin role — not from the admin_telegram_ids/admin_max_ids/
 * admin_phones DB-resident address lists.
 */
export type AdminNotificationTargetsPort = {
  loadTargets(): Promise<{ telegram: string[]; max: string[]; sms: string[]; email: string[] }>;
};
