import {
  pgTable, uuid, text, jsonb, timestamp, index, foreignKey,
} from 'drizzle-orm/pg-core';
import { platformUsers } from './schema';
import { beOrganizations } from './bookingEngine';

/**
 * Журнал изменений `system_settings` — доказательство «кто менял настройку».
 *
 * `organization_id` повторяет двойственность самой настройки: NULL — строка платформы,
 * заполнено — строка клиники. Поэтому у таблицы та же стена `platform-role+clinic`, что и
 * у `system_settings`, а не «журнал виден всем».
 */
export const systemSettingsAudit = pgTable(
  'system_settings_audit',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    key: text('key').notNull(),
    scope: text('scope').notNull(),
    oldValueJson: jsonb('old_value_json'),
    newValueJson: jsonb('new_value_json').notNull(),
    changedBy: uuid('changed_by'),
    changedAt: timestamp('changed_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    source: text('source'),
    organizationId: uuid('organization_id'),
  },
  (table) => [
    index('idx_system_settings_audit_key_at').on(table.key, table.changedAt.desc()),
    index('idx_system_settings_audit_org_key_at')
      .on(table.organizationId, table.key, table.changedAt.desc()),
    foreignKey({
      columns: [table.changedBy],
      foreignColumns: [platformUsers.id],
      name: 'system_settings_audit_changed_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'system_settings_audit_organization_id_fkey',
    }).onDelete('set null'),
  ],
);
