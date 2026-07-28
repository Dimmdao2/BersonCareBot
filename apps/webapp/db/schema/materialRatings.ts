import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { platformUsers } from './schema';

export const materialRatings = pgTable(
  'material_ratings',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    targetKind: text('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    stars: smallint('stars').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_material_ratings_organization_id').on(table.organizationId),
    unique('material_ratings_user_target_unique').on(
      table.userId,
      table.targetKind,
      table.targetId,
    ),
    index('idx_material_ratings_target').using(
      'btree',
      table.targetKind.asc().nullsLast().op('text_ops'),
      table.targetId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'material_ratings_organization_id_fkey',
    }).onDelete('cascade'),
    check(
      'material_ratings_target_kind_check',
      sql`target_kind = ANY (ARRAY['content_page'::text, 'lfk_exercise'::text, 'lfk_complex'::text])`,
    ),
    check('material_ratings_stars_check', sql`(stars >= 1) AND (stars <= 5)`),
  ],
);
