import { pgTable, uuid, text, integer, timestamp, primaryKey, inet } from 'drizzle-orm/pg-core';

/**
 * #1112 Л-8. Копилка неудачных попыток входа между двумя успешными входами: «сколько раз не подошло»
 * по паре «человек + устройство». Строки на каждую попытку не появляется — копится маленький итог,
 * который при успешном входе замораживается в строку журнала входов и обнуляется.
 *
 * Организации НЕ несёт по замыслу: попытка случается ДО того, как выбрана клиника. Прикладным ролям
 * таблица не открыта вовсе (`wall: 'definer-only'`): пишет её дверь `app.record_login_failure`,
 * гасит дверь `app.append_user_login_event`. Здесь она объявлена ради переписи колонок — инвариант
 * арендной стены проверяет только то, что drizzle-схема ему показывает
 * (`deploy/postgres/privileges/tenant-predicate-invariant.test.mjs`).
 */
export const loginFailureTally = pgTable(
  'login_failure_tally',
  {
    userId: uuid('user_id').notNull(),
    /** Пустая строка — общий мешок «с неизвестного устройства»: метку даёт только успешный вход. */
    deviceKey: text('device_key').notNull(),
    failedPasswords: integer('failed_passwords').default(0).notNull(),
    failedSecondFactor: integer('failed_second_factor').default(0).notNull(),
    /** Разные адреса, с которых шли отказы. Список ограничен тридцатью двумя (CHECK в миграции). */
    sourceAddresses: inet('source_addresses').array().default([]).notNull(),
    firstFailureAt: timestamp('first_failure_at', { withTimezone: true, mode: 'string' }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deviceKey] })],
);
