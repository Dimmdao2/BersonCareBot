import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { platformAudienceJson } from '@/infra/repos/pgAnalyticsAudience';
import type {
  AdminPlatformUserStatsPort,
  AdminPlatformUserStatsSnapshot,
} from '@/modules/admin-platform-stats/ports';

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function dayMap(value: unknown): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const [day, count] of Object.entries(asRecord(value))) byDay.set(day, asCount(count));
  return byDay;
}

export function createPgAdminPlatformUserStatsPort(): AdminPlatformUserStatsPort {
  return {
    async readStats({ iana, startUtcIso, endExclusiveUtcIso, audience }): Promise<AdminPlatformUserStatsSnapshot> {
      // Идентичность корня пишется ЛИТЕРАЛОМ в самом вызове: каталог call-site читает её из AST,
      // и вынесенная в константу строка для него — «dynamic named-root identity», то есть дверь
      // перестаёт быть проверяемой.
      //
      // Обращение ОДНО на оба экрана. Прежний код слал в базу шесть отношенческих запросов по
      // `platform_users` и `user_channel_bindings` под `app_platform_settings`: у этой роли на
      // первой таблице есть только `SELECT (id, calendar_timezone)`, а на второй нет ничего,
      // поэтому оба экрана отдавали 500 с 42501 (живой обход TEST 22.08.2026). Грант не
      // выдаётся — решение владельца Р-АДМИН: дверь отдаёт СЧЁТ, и читать строки людей роли
      // по-прежнему нечем.
      //
      // `excludeStaffRoles: false` — как и раньше на этих двух экранах: оба считают строки
      // `role = 'client'`, где сотрудников нет по определению.
      const args = [
        startUtcIso,
        endExclusiveUtcIso,
        iana,
        platformAudienceJson(audience, { excludeStaffRoles: false }),
      ] as const;
      const result = await runWebappNamedRoot<{ stats: unknown }>(
        getWebappSqlDb(),
        'app.read_platform_user_stats(timestamp with time zone,timestamp with time zone,text,text)',
        args,
        sql`SELECT app.read_platform_user_stats(
          ${sql.param(args[0])}::timestamptz,
          ${sql.param(args[1])}::timestamptz,
          ${sql.param(args[2])}::text,
          ${sql.param(args[3])}::text
        ) AS stats`,
      );

      const raw = asRecord(result.rows[0]?.stats);
      const registrations = asRecord(raw.registrations);
      const merges = asRecord(raw.merges);
      const subscribers = asRecord(raw.subscribers);

      return {
        registrationsTotal: asCount(registrations.total),
        mergesTotal: asCount(merges.total),
        registrationsByDay: dayMap(registrations.byDay),
        mergesByDay: dayMap(merges.byDay),
        subscribersBeforeStart: asCount(subscribers.countBeforeStart),
        subscribersNewByDay: dayMap(subscribers.newByDay),
      };
    },
  };
}
