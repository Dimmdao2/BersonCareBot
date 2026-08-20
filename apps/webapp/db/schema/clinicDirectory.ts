import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { beOrganizations } from './bookingEngine';
import { platformUsers } from './schema';

/**
 * Minimal seed of the S6 `clinic_public_directory_entries` public-catalog projection
 * (`docs/_TODO/SAAS_FOUNDATION/SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` §5).
 *
 * Scope for #805 (owner canon `/book/{publicSlug}`, `OWNER_RULINGS_2026-07-17.md` §1): only the
 * columns needed to resolve a public booking slug to a published organization. The full marketing
 * projection (description/locations/specialists/services JSON, owner publish flow) is future S6.3
 * scope and can `ALTER TABLE ADD COLUMN` onto this same table without touching this slice.
 */
export const clinicPublicDirectoryEntries = pgTable(
  'clinic_public_directory_entries',
  {
    /** One-to-one with the organization; never exposed publicly, only used for internal joins. */
    organizationId: uuid('organization_id').primaryKey().notNull(),
    /** Public, stable, lower-case URL id. Never the organization UUID. */
    slug: text().notNull(),
    /** Explicit copy of `be_organizations.title` at publish time; owner-editable afterwards. */
    displayName: text('display_name').notNull(),
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    /**
     * Public clinic card (`/{clinic}`), owner ruling 19.08 «сделать публичную страницу для клиник
     * ... просто их визитку с описанием». Everything an anonymous visitor sees lives in THIS row:
     * the page reads exactly one row of exactly one table and never touches a tenant table
     * (`SAAS_S6_CLINIC_DIRECTORY_AND_ORG_BOUNDARY.md` §5).
     */
    description: text(),
    publicContactPhone: text('public_contact_phone'),
    publicContactEmail: text('public_contact_email'),
    publicWebsiteUrl: text('public_website_url'),
    /**
     * Snapshot of the clinic's own active branches taken at save time: `title`, `cityCode`,
     * `address` only. Internal ids, timezone, colour and sort order stay out of the projection —
     * the address is what the clinic already hangs on its door, the rest is tenant internals.
     */
    locationsJson: jsonb('locations_json').default([]).notNull(),
    /** Media ids are stored; readiness and delivery facts are resolved at read time. */
    logoMediaId: uuid('logo_media_id'),
    photoMediaIds: uuid('photo_media_ids').array().default([]).notNull(),
    cardIsPublished: boolean('card_is_published').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_clinic_public_directory_entries_slug').using(
      'btree',
      sql`lower(${table.slug})`,
    ),
    index('idx_clinic_public_directory_entries_published').using(
      'btree',
      table.isPublished.asc().nullsLast().op('bool_ops'),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'clinic_public_directory_entries_organization_id_fkey',
    }).onDelete('cascade'),
    check(
      'clinic_public_directory_entries_slug_lower_check',
      sql`${table.slug} = lower(${table.slug})`,
    ),
    check(
      'clinic_public_directory_entries_slug_not_blank_check',
      sql`length(btrim(${table.slug})) > 0`,
    ),
    check(
      'clinic_public_directory_entries_card_text_limits_check',
      sql`(${table.description} IS NULL OR length(${table.description}) <= 4000)
        AND (${table.publicContactPhone} IS NULL OR length(${table.publicContactPhone}) <= 64)
        AND (${table.publicContactEmail} IS NULL OR length(${table.publicContactEmail}) <= 320)
        AND (${table.publicWebsiteUrl} IS NULL OR length(${table.publicWebsiteUrl}) <= 512)`,
    ),
    check(
      'clinic_public_directory_entries_photo_media_ids_bound_check',
      sql`array_length(${table.photoMediaIds}, 1) IS NULL OR array_length(${table.photoMediaIds}, 1) <= 12`,
    ),
  ],
);

export const ORGANIZATION_SLUG_CLAIM_KINDS = ['reservation', 'current', 'alias'] as const;
export type OrganizationSlugClaimKind = (typeof ORGANIZATION_SLUG_CLAIM_KINDS)[number];

/**
 * Server-owned platform namespace for organization slugs.
 *
 * `slug` is lookup/presentation data only. Every durable claim keeps the immutable
 * `organization_id` target. Alias rows deliberately contain no target-slug column: resolution
 * always joins the organization's single current row, so redirect chains are impossible by shape.
 */
export const organizationSlugClaims = pgTable(
  'organization_slug_claims',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    slug: text().notNull(),
    kind: text().notNull(),
    organizationId: uuid('organization_id').notNull(),
    createdByPlatformUserId: uuid('created_by_platform_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_organization_slug_claims_slug').using('btree', sql`lower(${table.slug})`),
    uniqueIndex('uq_organization_slug_claims_current_org')
      .using('btree', table.organizationId.asc().nullsLast().op('uuid_ops'))
      .where(sql`${table.kind} = 'current'`),
    index('idx_organization_slug_claims_org_kind').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops'),
      table.kind.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'organization_slug_claims_organization_id_fkey',
    }),
    foreignKey({
      columns: [table.createdByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'organization_slug_claims_created_by_fkey',
    }),
    check(
      'organization_slug_claims_slug_format_check',
      sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' AND ${table.slug} NOT LIKE '%--%'`,
    ),
    check(
      'organization_slug_claims_slug_reserved_check',
      sql`${table.slug} <> ALL (ARRAY[
        'account', 'admin', 'api', 'app', 'auth', 'book', 'booking', 'doctor', 'favicon',
        'health', 'help', 'join', 'legal', 'login', 'manage', 'manifest', 'patient', 'privacy',
        'register', 'robots', 'settings', 'sign-in', 'signup', 'sitemap', 'status', 'support',
        'terms', 'widget', '_next'
      ]::text[])`,
    ),
    check(
      'organization_slug_claims_kind_check',
      sql`${table.kind} = ANY (ARRAY['reservation'::text, 'current'::text, 'alias'::text])`,
    ),
  ],
);

export const ORGANIZATION_SLUG_RENAME_INITIATORS = ['clinic', 'platform_admin'] as const;
export type OrganizationSlugRenameInitiator =
  (typeof ORGANIZATION_SLUG_RENAME_INITIATORS)[number];

/** Append-only proof of every owner-directed slug rename. */
export const organizationSlugRenameEvents = pgTable(
  'organization_slug_rename_events',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid('organization_id').notNull(),
    actorPlatformUserId: uuid('actor_platform_user_id'),
    /**
     * Кто инициировал смену — ШТАМП на самом событии, поставленный в момент записи. Раньше этот факт
     * выводился соединением с текущим членством, а членство каскадно удаляется вместе с аккаунтом:
     * удаление сотрудника возвращало клинике израсходованную пожизненную смену. Штамп ни от чего
     * внешнего не зависит. DEFAULT ограничительный: забытое значение тратит право, а не выдаёт его.
     */
    initiatedBy: text('initiated_by').default('clinic').notNull(),
    previousSlug: text('previous_slug').notNull(),
    nextSlug: text('next_slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_organization_slug_rename_events_org_created').using(
      'btree',
      table.organizationId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'organization_slug_rename_events_organization_id_fkey',
    }),
    foreignKey({
      columns: [table.actorPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'organization_slug_rename_events_actor_fkey',
    }),
    check(
      'organization_slug_rename_events_slug_change_check',
      sql`${table.previousSlug} <> ${table.nextSlug}`,
    ),
    check(
      'organization_slug_rename_events_slugs_lower_check',
      sql`${table.previousSlug} = lower(${table.previousSlug}) AND ${table.nextSlug} = lower(${table.nextSlug})`,
    ),
    check(
      'organization_slug_rename_events_initiated_by_check',
      sql`${table.initiatedBy} = ANY (ARRAY['clinic'::text, 'platform_admin'::text])`,
    ),
  ],
);
