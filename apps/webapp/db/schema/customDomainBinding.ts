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
import { platformUsers } from './schema';

/**
 * B2/B8/C5a — server-owned custom-domain binding lifecycle
 * (`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`).
 *
 * `hostname` is ALWAYS computed server-side from `baseDomain` + `placement` (+ `subdomainLabel` for
 * `subdomain` placement) — never accepted from the caller as a precomputed value. The
 * `hostname_matches_placement_check` constraint below makes that a database invariant, not just a
 * service-layer promise.
 *
 * Uniqueness is GLOBAL and PERMANENT (`uq_org_custom_domain_bindings_hostname` has no status
 * filter): once any organization has ever bound a hostname, that exact hostname cannot be bound by
 * anyone else again, even after the row moves to `quarantine`. This mirrors the tombstone discipline
 * `organization_slug_claims` already uses for the same anti-squatting reason — a domain a clinic
 * gave up is not immediately available to a stranger who was watching for exactly that.
 *
 * `organizationId` is nullable ON PURPOSE, same tombstone rule as `organization_slug_claims`: if the
 * owning organization is deleted, the FK nulls this column and the row survives as an unlinked
 * tombstone that still holds the hostname. Ownership is otherwise immutable: no code path in this
 * slice ever UPDATEs `organization_id` on an existing row (there is no DB trigger enforcing this —
 * see the migration header for why that hardening is deferred).
 *
 * Only `status = 'active'` ever participates in Host resolution or the canonical 308 redirect
 * (`app.resolve_active_organization_by_custom_domain`); every other status is inert for the request
 * path by construction of that function's WHERE clause, not by caller discipline.
 */
export const ORG_CUSTOM_DOMAIN_PLACEMENTS = ['apex', 'subdomain'] as const;
export type OrgCustomDomainPlacement = (typeof ORG_CUSTOM_DOMAIN_PLACEMENTS)[number];

/**
 * `pending` — intent saved, nothing verified yet.
 * `dns_ready` — a later verifier confirmed the hostname resolves to our edge (never inferred here).
 * `active` — the only status that resolves Host / redirects; set only via the narrow internal
 *   transition door, never from DNS alone (owner ruling reopening this item, 07.09.2026).
 * `failed` — the verifier could not proceed (bad DNS, CA rejection, etc.); `statusReason` holds why.
 * `suspended` — was active, now paused (e.g. tariff no longer includes the mechanic) without losing
 *   the binding row itself.
 * `quarantine` — permanently retired; the hostname stays claimed (see uniqueness note above) but the
 *   row never again resolves anything.
 */
export const ORG_CUSTOM_DOMAIN_STATUSES = [
  'pending',
  'dns_ready',
  'active',
  'failed',
  'suspended',
  'quarantine',
] as const;
export type OrgCustomDomainStatus = (typeof ORG_CUSTOM_DOMAIN_STATUSES)[number];

const HOSTNAME_LABEL_SQL = `[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?`;

export const orgCustomDomainBindings = pgTable(
  'org_custom_domain_bindings',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    /** Nullable tombstone column — see the table doc comment. */
    organizationId: uuid('organization_id'),
    /** The domain the clinic owns, as entered (e.g. `clinic.ru`). Never the final hostname alone. */
    baseDomain: text('base_domain').notNull(),
    placement: text().default('apex').notNull(),
    /** Required for `subdomain` placement, NULL for `apex` — enforced by a CHECK below. */
    subdomainLabel: text('subdomain_label'),
    /** Server-computed final hostname; see the table doc comment. */
    hostname: text().notNull(),
    status: text().default('pending').notNull(),
    statusReason: text('status_reason'),
    createdByPlatformUserId: uuid('created_by_platform_user_id'),
    activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_org_custom_domain_bindings_hostname').using(
      'btree',
      sql`lower(${table.hostname})`,
    ),
    uniqueIndex('uq_org_custom_domain_bindings_live_org')
      .using('btree', table.organizationId.asc().nullsLast().op('uuid_ops'))
      .where(sql`${table.organizationId} IS NOT NULL AND ${table.status} <> 'quarantine'`),
    index('idx_org_custom_domain_bindings_status').using(
      'btree',
      table.status.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: 'org_custom_domain_bindings_organization_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.createdByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: 'org_custom_domain_bindings_created_by_fkey',
    }).onDelete('set null'),
    check(
      'org_custom_domain_bindings_placement_check',
      sql`${table.placement} = ANY (ARRAY['apex'::text, 'subdomain'::text])`,
    ),
    check(
      'org_custom_domain_bindings_status_check',
      sql`${table.status} = ANY (ARRAY['pending'::text, 'dns_ready'::text, 'active'::text, 'failed'::text, 'suspended'::text, 'quarantine'::text])`,
    ),
    check(
      'org_custom_domain_bindings_subdomain_label_presence_check',
      sql`(${table.placement} = 'apex' AND ${table.subdomainLabel} IS NULL)
        OR (${table.placement} = 'subdomain' AND ${table.subdomainLabel} IS NOT NULL)`,
    ),
    check(
      'org_custom_domain_bindings_lower_check',
      sql`${table.baseDomain} = lower(${table.baseDomain})
        AND ${table.hostname} = lower(${table.hostname})
        AND (${table.subdomainLabel} IS NULL OR ${table.subdomainLabel} = lower(${table.subdomainLabel}))`,
    ),
    check(
      'org_custom_domain_bindings_base_domain_format_check',
      sql.raw(
        `base_domain ~ '^${HOSTNAME_LABEL_SQL}(\\.${HOSTNAME_LABEL_SQL})+$' AND length(base_domain) <= 253`,
      ),
    ),
    check(
      'org_custom_domain_bindings_subdomain_label_format_check',
      sql.raw(`subdomain_label IS NULL OR subdomain_label ~ '^${HOSTNAME_LABEL_SQL}$'`),
    ),
    // Database-level backstop for "exact hostname computed server-side" (B2): even a buggy write
    // path cannot desync `hostname` from `baseDomain`/`placement`/`subdomainLabel`.
    check(
      'org_custom_domain_bindings_hostname_matches_placement_check',
      sql`${table.hostname} = CASE WHEN ${table.placement} = 'apex' THEN ${table.baseDomain}
        ELSE ${table.subdomainLabel} || '.' || ${table.baseDomain} END`,
    ),
  ],
);
