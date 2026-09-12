import { pgTable, uuid, bigint, integer } from 'drizzle-orm/pg-core';

/**
 * Блокировка входа по коду из почты: до какого момента (`locked_until`, epoch ms) и какой
 * по счёту цикл блокировки идёт.
 *
 * Организации НЕ несёт по замыслу: блокировка принадлежит ЧЕЛОВЕКУ и считается до того, как
 * выбрана клиника. Прикладным ролям таблица не открыта — ходит только definer-шов входа.
 */
export const emailOtpLocks = pgTable('email_otp_locks', {
  userId: uuid('user_id').primaryKey().notNull(),
  lockedUntil: bigint('locked_until', { mode: 'number' }).default(0).notNull(),
  lockoutCycle: integer('lockout_cycle').default(0).notNull(),
});
