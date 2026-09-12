import {
  pgTable, bigserial, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Соответствие «запись → событие Google Calendar».
 *
 * Организации НЕ несёт по замыслу: ключ `appointment_key` глобально уникален, а клиника
 * выводится из самой записи. Стена у таблицы служебная (`definer-only`) — прикладным ролям
 * она не открыта вовсе, ходят только названные definer-швы синхронизации календаря.
 */
export const bookingCalendarMap = pgTable(
  'booking_calendar_map',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    appointmentKey: text('appointment_key').notNull(),
    gcalEventId: text('gcal_event_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('booking_calendar_map_appointment_key_key').on(table.appointmentKey),
  ],
);
