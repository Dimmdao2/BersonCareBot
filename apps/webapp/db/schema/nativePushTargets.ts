import { foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { platformUsers } from './schema';

/** A device installation is a Push transport target, never a notification channel. */
export const nativePushTargets = pgTable(
  'native_push_targets',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    appId: text('app_id').notNull(),
    provider: text('provider').notNull(),
    installationIdHash: text('installation_id_hash').notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenCiphertext: text('token_ciphertext').notNull(),
    tokenKeyId: text('token_key_id').notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_native_push_targets_installation').using('btree', table.appId, table.provider, table.installationIdHash),
    uniqueIndex('uq_native_push_targets_user_token').using('btree', table.userId, table.appId, table.provider, table.tokenHash),
    index('idx_native_push_targets_active_user').using('btree', table.userId, table.appId, table.provider, table.deactivatedAt),
    foreignKey({ columns: [table.userId], foreignColumns: [platformUsers.id], name: 'native_push_targets_user_id_fkey' }).onDelete('cascade'),
  ],
);
