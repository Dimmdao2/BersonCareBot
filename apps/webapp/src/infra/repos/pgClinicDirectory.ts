import { and, count, eq, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
  getCurrentDbPrincipalPlatformUserId,
} from '@bersoncare/db-principal';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { getDrizzle } from '@/app-layer/db/drizzle';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
} from '@/infra/db/runWebappSql';
import type { ClinicDirectoryPort } from '@/modules/clinic-directory/ports';
import {
  beOrganizationMembers,
  beOrganizations,
  clinicPublicDirectoryEntries,
  organizationSlugClaims,
  organizationSlugRenameEvents,
} from '../../../db/schema';

function exactStaffOrganizationPrincipal(organizationId: string): string {
  const principal = getCurrentDbPrincipal();
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const actorPlatformUserId = getCurrentDbPrincipalPlatformUserId();
  if (principal?.kind !== 'staff' || !principalOrganizationId || !actorPlatformUserId) {
    throw new Error('staff_principal_required');
  }
  if (principalOrganizationId !== organizationId)
    throw new Error('organization_principal_mismatch');
  return actorPlatformUserId;
}

async function lockOrganizationSlugClaims(
  tx: Pick<DrizzleDb, 'execute'>,
  organizationId: string,
): Promise<void> {
  // One deterministic organization-scoped lock is acquired before every claim row lock. This
  // keeps reserve/claim/rename from deadlocking through opposite reservation/current lock order.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('organization_slug_claims:' || ${organizationId}::text, 0))`,
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value.code === '23505' || value.cause?.code === '23505';
}

/**
 * Calls the narrow SECURITY DEFINER bootstrap resolver `app.resolve_public_organization_by_slug`
 * (`deploy/postgres/public-clinic-slug-bootstrap-resolver.sql`). The bootstrap principal has no
 * direct SELECT on `clinic_public_directory_entries` / `be_organizations`; this function is the
 * only permitted path from an unauthenticated slug to an organization id.
 */
export function createPgClinicDirectoryPort(): ClinicDirectoryPort {
  return {
    async resolveOrganizationIdBySlug(slug) {
      const result = await runWebappNamedRoot<{ organization_id: string | null }>(
        getWebappSqlDb(),
        'app.resolve_public_organization_by_slug(text)',
        [slug],
        sql`SELECT app.resolve_public_organization_by_slug(${slug}::text)::text AS organization_id`,
      );
      return result.rows[0]?.organization_id ?? null;
    },

    async getPublishedSlugForOrganization(organizationId) {
      const rows = await getDrizzle()
        .select({ slug: clinicPublicDirectoryEntries.slug })
        .from(clinicPublicDirectoryEntries)
        .where(
          and(
            eq(clinicPublicDirectoryEntries.organizationId, organizationId),
            eq(clinicPublicDirectoryEntries.isPublished, true),
          ),
        )
        .limit(1);
      return rows[0]?.slug ?? null;
    },

    async getSlugManagementState(organizationId) {
      exactStaffOrganizationPrincipal(organizationId);
      const db = getDrizzle();
      const [current] = await db
        .select({ slug: organizationSlugClaims.slug })
        .from(organizationSlugClaims)
        .where(
          and(
            eq(organizationSlugClaims.organizationId, organizationId),
            eq(organizationSlugClaims.kind, 'current'),
          ),
        )
        .limit(1);
      // Самостоятельные смены — те, чей актор является членом ЭТОЙ организации. Смена, сделанная
      // админом платформы по обращению в поддержку, лимит не тратит: он клинике не член, и inner
      // join её просто не находит. Счётчика-колонки намеренно нет — событийная таблица и есть
      // источник истины, производное поле с ней разошлось бы (владелец 19.08, план §14).
      const [selfRenames] = await db
        .select({ used: count() })
        .from(organizationSlugRenameEvents)
        .innerJoin(
          beOrganizationMembers,
          and(
            eq(beOrganizationMembers.platformUserId, organizationSlugRenameEvents.actorPlatformUserId),
            eq(beOrganizationMembers.organizationId, organizationSlugRenameEvents.organizationId),
          ),
        )
        .where(eq(organizationSlugRenameEvents.organizationId, organizationId));
      const used = Number(selfRenames?.used ?? 0);
      return {
        currentSlug: current?.slug ?? null,
        selfRenamesUsed: used,
        selfRenameAllowed: used < 1,
      };
    },

    async resolveCanonicalSlug(slug) {
      const result = await runWebappNamedRoot<{
        organization_id: string;
        requested_slug: string;
        requested_kind: 'current' | 'alias';
        canonical_slug: string;
      }>(
        getWebappSqlDb(),
        'app.resolve_public_organization_slug(text)',
        [slug],
        sql`SELECT * FROM app.resolve_public_organization_slug(${slug}::text)`,
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        organizationId: row.organization_id,
        requestedSlug: row.requested_slug,
        canonicalSlug: row.canonical_slug,
        disposition: row.requested_kind === 'alias' ? 'redirect' : 'current',
      };
    },

    async isSlugAvailable(slug) {
      const result = await runWebappNamedRoot<{ available: boolean }>(
        getWebappSqlDb(),
        'app.is_organization_slug_available(text)',
        [slug],
        sql`SELECT app.is_organization_slug_available(${slug}::text) AS available`,
      );
      return result.rows[0]?.available === true;
    },

    async reserveSlug(input) {
      const actorPlatformUserId = exactStaffOrganizationPrincipal(input.organizationId);
      try {
        return await runDrizzleMutationTransaction(async (tx) => {
          await lockOrganizationSlugClaims(tx, input.organizationId);
          const now = new Date().toISOString();
          const targetCondition = eq(organizationSlugClaims.organizationId, input.organizationId);
          const [existingReservation] = await tx
            .select({ id: organizationSlugClaims.id })
            .from(organizationSlugClaims)
            .where(and(eq(organizationSlugClaims.kind, 'reservation'), targetCondition))
            .limit(1)
            .for('update');
          // Never row-lock a global collision: it may belong to another organization whose own
          // reserve transaction holds the opposite reservation row. A plain MVCC read avoids the
          // cross-org A->B / B->A lock cycle; the global unique index closes concurrent empty-slug
          // races and maps the losing write to slug_unavailable below.
          const [collision] = await tx
            .select({
              id: organizationSlugClaims.id,
              kind: organizationSlugClaims.kind,
              organizationId: organizationSlugClaims.organizationId,
            })
            .from(organizationSlugClaims)
            .where(eq(organizationSlugClaims.slug, input.slug))
            .limit(1);

          if (collision && collision.id !== existingReservation?.id) {
            if (collision.kind === 'alias' && collision.organizationId === input.organizationId) {
              if (existingReservation) {
                await tx
                  .delete(organizationSlugClaims)
                  .where(eq(organizationSlugClaims.id, existingReservation.id));
              }
              // The alias itself is the durable reservation. Leaving it untouched keeps the old
              // public link resolving until renameSlug atomically promotes it back to current.
              return { ok: true as const, slug: input.slug };
            }
            return { ok: false as const, code: 'slug_unavailable' as const };
          }

          const values = {
            slug: input.slug,
            kind: 'reservation',
            organizationId: input.organizationId,
            createdByPlatformUserId: actorPlatformUserId,
            updatedAt: now,
          };
          if (existingReservation) {
            await tx
              .update(organizationSlugClaims)
              .set(values)
              .where(eq(organizationSlugClaims.id, existingReservation.id));
          } else {
            await tx.insert(organizationSlugClaims).values(values);
          }
          return { ok: true as const, slug: input.slug };
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, code: 'slug_unavailable' };
        throw error;
      }
    },

    async claimReservedSlug(input) {
      const actorPlatformUserId = exactStaffOrganizationPrincipal(input.organizationId);
      try {
        return await runDrizzleMutationTransaction(async (tx) => {
          await lockOrganizationSlugClaims(tx, input.organizationId);
          const [reservation] = await tx
            .select()
            .from(organizationSlugClaims)
            .where(eq(organizationSlugClaims.slug, input.slug))
            .limit(1)
            .for('update');
          if (!reservation || reservation.kind !== 'reservation') {
            return { ok: false as const, code: 'reservation_not_found' as const };
          }
          if (reservation.organizationId !== input.organizationId) {
            return { ok: false as const, code: 'reservation_owner_mismatch' as const };
          }
          const [current] = await tx
            .select({ id: organizationSlugClaims.id })
            .from(organizationSlugClaims)
            .where(
              and(
                eq(organizationSlugClaims.organizationId, input.organizationId),
                eq(organizationSlugClaims.kind, 'current'),
              ),
            )
            .limit(1)
            .for('update');
          if (current) {
            return { ok: false as const, code: 'current_slug_already_exists' as const };
          }
          const [organization] = await tx
            .select({ title: beOrganizations.title })
            .from(beOrganizations)
            .where(eq(beOrganizations.id, input.organizationId))
            .limit(1);
          if (!organization) throw new Error('organization_not_found');
          const now = new Date().toISOString();
          await tx
            .update(organizationSlugClaims)
            .set({
              kind: 'current',
              organizationId: input.organizationId,
              createdByPlatformUserId: actorPlatformUserId,
              updatedAt: now,
            })
            .where(eq(organizationSlugClaims.id, reservation.id));
          await tx.insert(clinicPublicDirectoryEntries).values({
            organizationId: input.organizationId,
            slug: input.slug,
            displayName: organization.title,
            isPublished: true,
            publishedAt: now,
            updatedAt: now,
          });
          return { ok: true as const, slug: input.slug };
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, code: 'slug_unavailable' };
        throw error;
      }
    },

    async renameSlug(input) {
      const actorPlatformUserId = exactStaffOrganizationPrincipal(input.organizationId);
      try {
        return await runDrizzleMutationTransaction(async (tx) => {
          await lockOrganizationSlugClaims(tx, input.organizationId);
          const [current] = await tx
            .select()
            .from(organizationSlugClaims)
            .where(
              and(
                eq(organizationSlugClaims.organizationId, input.organizationId),
                eq(organizationSlugClaims.kind, 'current'),
              ),
            )
            .limit(1)
            .for('update');
          if (!current) return { ok: false as const, code: 'current_slug_not_found' as const };

          const [targetClaim] = await tx
            .select()
            .from(organizationSlugClaims)
            .where(eq(organizationSlugClaims.slug, input.reservedSlug))
            .limit(1)
            .for('update');
          if (
            !targetClaim ||
            (targetClaim.kind !== 'reservation' && targetClaim.kind !== 'alias')
          ) {
            return { ok: false as const, code: 'reservation_not_found' as const };
          }
          if (targetClaim.organizationId !== input.organizationId) {
            return { ok: false as const, code: 'reservation_owner_mismatch' as const };
          }

          const now = new Date().toISOString();
          if (targetClaim.kind === 'alias') {
            await tx
              .update(organizationSlugClaims)
              .set({ kind: 'alias', updatedAt: now })
              .where(eq(organizationSlugClaims.id, current.id));
            await tx
              .update(organizationSlugClaims)
              .set({ kind: 'current', updatedAt: now })
              .where(eq(organizationSlugClaims.id, targetClaim.id));
          } else {
            await tx
              .delete(organizationSlugClaims)
              .where(eq(organizationSlugClaims.id, targetClaim.id));
            await tx
              .update(organizationSlugClaims)
              .set({ slug: input.reservedSlug, updatedAt: now })
              .where(eq(organizationSlugClaims.id, current.id));
          }
          await tx
            .update(clinicPublicDirectoryEntries)
            .set({ slug: input.reservedSlug, updatedAt: now })
            .where(eq(clinicPublicDirectoryEntries.organizationId, input.organizationId));
          if (targetClaim.kind === 'reservation') {
            await tx.insert(organizationSlugClaims).values({
              slug: current.slug,
              kind: 'alias',
              organizationId: input.organizationId,
              createdByPlatformUserId: actorPlatformUserId,
              updatedAt: now,
            });
          }
          await tx.insert(organizationSlugRenameEvents).values({
            organizationId: input.organizationId,
            actorPlatformUserId,
            previousSlug: current.slug,
            nextSlug: input.reservedSlug,
          });
          return { ok: true as const, slug: input.reservedSlug };
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, code: 'slug_unavailable' };
        throw error;
      }
    },
  };
}
