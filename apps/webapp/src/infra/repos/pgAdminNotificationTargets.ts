import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

export type AdminNotificationTargets = {
  telegram: string[];
  max: string[];
  sms: string[];
  email: string[];
};

/** Классы контекста, из которых этот список читается. Значение проверяется гейтом в теле функции. */
export type AdminNotificationTargetsContextClass = 'pre_session' | 'service';

/**
 * C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): operator-alert recipients are resolved
 * from WHO ACTUALLY HOLDS THE ADMIN ROLE right now — not from the `admin_telegram_ids`/
 * `admin_max_ids`/`admin_phones` address lists, which used to double as both a role grant and an
 * audience. Cutting the grant half without moving this half would have silently killed alert
 * delivery too (the class of outage the July SMTP-quota gap already was — unnoticed for a day).
 *
 * 19.08: чтение переведено с сырого relation-SELECT на объявленный именованный корень
 * `app.read_admin_notification_targets(text)`. Прежний комментарий здесь утверждал «No RLS/new grant
 * needed: `platform_users` и `user_channel_bindings` и так читает любая роль» — с введением режима
 * port-контекста это перестало быть правдой: маршрут `/api/integrator/admin-notification-targets`
 * не входит принципалом вовсе, попадает в `pre_session`, у которого relation-возможности нет, и
 * чтение падало ДО базы (502 → три ретрая вебаппа с backoff → 3.1 с чужого времени на запись).
 * Класс контекста передаётся аргументом (форма `app.passkey_issue_challenge`) потому, что то же
 * тело читает тик операторского дайджеста под инфра-принципалом (`service`), а второго тела для
 * той же работы заводить нельзя.
 */
export async function loadAdminNotificationTargetsFromDb(
  contextClass: AdminNotificationTargetsContextClass = 'service',
): Promise<AdminNotificationTargets> {
  const result = await runWebappNamedRoot<{ result: unknown }>(
    getWebappSqlDb(),
    'app.read_admin_notification_targets(text)',
    [contextClass],
    sql`SELECT app.read_admin_notification_targets(${contextClass}::text) AS result`,
  );
  const payload = result.rows[0]?.result;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('admin_notification_targets_invalid');
  }
  const row = payload as Record<string, unknown>;
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  return {
    telegram: list(row.telegram),
    max: list(row.max),
    sms: list(row.sms),
    email: list(row.email),
  };
}
