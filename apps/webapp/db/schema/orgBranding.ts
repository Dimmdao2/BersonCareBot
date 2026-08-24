import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { mediaFiles, platformUsers } from './schema';

/**
 * UX-05 slice B1 — organization brand publication (migration 0238).
 * Publication lives ON the revision (`status` + `published_at`), not in a separate pointer table:
 * a partial unique index makes "at most one published revision per organization" a database
 * invariant that a pointer column cannot express. See the migration header for the full rationale.
 */
export const ORG_BRAND_REVISION_STATUSES = ['draft', 'published', 'archived'] as const;
export type OrgBrandRevisionStatusValue = (typeof ORG_BRAND_REVISION_STATUSES)[number];

export const orgBrandRevisions = pgTable(
  'org_brand_revisions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    status: text().default('draft').notNull(),
    /** Paid display-name override; NULL means "use the canonical core organization name". */
    displayName: text('display_name'),
    /** Optional patient-app name; NULL falls back to the effective organization display name. */
    patientAppName: text('patient_app_name'),
    /** One optional patient accent token; currently a normalized six-digit CSS hex color. */
    accentToken: text('accent_token'),
    /** Paid logo as a `public.media_files` id; the effective `/api/media/<uuid>` URL is server-computed. */
    logoMediaId: uuid('logo_media_id'),
    createdByPlatformUserId: uuid('created_by_platform_user_id').notNull(),
    publishedByPlatformUserId: uuid('published_by_platform_user_id'),
    archivedByPlatformUserId: uuid('archived_by_platform_user_id'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_org_brand_revisions_published')
      .on(table.organizationId)
      .where(sql`${table.status} = 'published'`),
    uniqueIndex('uq_org_brand_revisions_draft')
      .on(table.organizationId)
      .where(sql`${table.status} = 'draft'`),
    index('idx_org_brand_revisions_org_status').on(table.organizationId, table.status),
    index('idx_org_brand_revisions_logo_media')
      .on(table.logoMediaId)
      .where(sql`${table.logoMediaId} IS NOT NULL`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'org_brand_revisions_organization_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.logoMediaId],
      foreignColumns: [mediaFiles.id],
      name: 'org_brand_revisions_logo_media_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.createdByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'org_brand_revisions_created_by_platform_user_id_fkey',
    }),
    foreignKey({
      columns: [table.publishedByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'org_brand_revisions_published_by_platform_user_id_fkey',
    }),
    foreignKey({
      columns: [table.archivedByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'org_brand_revisions_archived_by_platform_user_id_fkey',
    }),
    check(
      'org_brand_revisions_status_check',
      sql`${table.status} = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])`,
    ),
    check(
      'org_brand_revisions_publication_state_check',
      sql`(${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.archivedAt} IS NULL AND ${table.publishedByPlatformUserId} IS NULL AND ${table.archivedByPlatformUserId} IS NULL) OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.archivedAt} IS NULL AND ${table.publishedByPlatformUserId} IS NOT NULL AND ${table.archivedByPlatformUserId} IS NULL) OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL AND ${table.archivedByPlatformUserId} IS NOT NULL)`,
    ),
    check(
      'org_brand_revisions_display_name_check',
      sql`${table.displayName} IS NULL OR (btrim(${table.displayName}) <> '' AND length(${table.displayName}) <= 120)`,
    ),
    check(
      'org_brand_revisions_patient_app_name_check',
      sql`${table.patientAppName} IS NULL OR (btrim(${table.patientAppName}) <> '' AND length(${table.patientAppName}) <= 120)`,
    ),
    check(
      'org_brand_revisions_accent_token_check',
      sql`${table.accentToken} IS NULL OR ${table.accentToken} ~ '^#[0-9a-f]{6}$'`,
    ),
  ],
);
