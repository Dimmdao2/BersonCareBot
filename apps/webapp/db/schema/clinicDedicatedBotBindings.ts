import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, boolean, timestamp, primaryKey, uniqueIndex, foreignKey, check,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';

/**
 * Привязка выделенного бота клиники к каналу (Telegram/MAX).
 *
 * Сам секрет бота здесь НЕ лежит — только отпечаток учётных данных
 * (`credential_fingerprint`, sha256 hex), по которому канал узнаёт свою клинику.
 * Ключ — пара «канал + клиника»: у одной клиники один бот на канал.
 */
export const clinicDedicatedBotBindings = pgTable(
  'clinic_dedicated_bot_bindings',
  {
    channel: text('channel').notNull(),
    organizationId: uuid('organization_id').notNull(),
    credentialFingerprint: text('credential_fingerprint').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.channel, table.organizationId],
      name: 'clinic_dedicated_bot_bindings_pkey',
    }),
    uniqueIndex('clinic_dedicated_bot_bindings_channel_credential_fingerprin_key')
      .on(table.channel, table.credentialFingerprint),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'clinic_dedicated_bot_bindings_organization_id_fkey',
    }).onDelete('cascade'),
    check(
      'clinic_dedicated_bot_bindings_channel_check',
      sql`channel = ANY (ARRAY['telegram'::text, 'max'::text])`,
    ),
    check(
      'clinic_dedicated_bot_bindings_credential_fingerprint_check',
      sql`credential_fingerprint ~ '^[0-9a-f]{64}$'::text`,
    ),
  ],
);
