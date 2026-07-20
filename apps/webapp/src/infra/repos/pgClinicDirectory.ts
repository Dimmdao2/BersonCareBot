import { and, eq } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { ClinicDirectoryPort } from '@/modules/clinic-directory/ports';
import {
  clinicPublicDirectoryEntries,
  organizationSlugClaims,
  organizationSlugRenameEvents,
} from '../../../db/schema';

function exactOrganizationPrincipal(organizationId: string): void {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) throw new Error('organization_principal_required');
  if (principalOrganizationId !== organizationId)
    throw new Error('organization_principal_mismatch');
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
      const result = await runWebappPgText<{ organization_id: string | null }>(
        `SELECT app.resolve_public_organization_by_slug($1::text)::text AS organization_id`,
        [slug],
      );
      return result.rows[0]?.organization_id ?? null;
    },

    async resolveCanonicalSlug(slug) {
      const result = await runWebappPgText<{
        organization_id: string;
        requested_slug: string;
        requested_kind: 'current' | 'alias';
        canonical_slug: string;
      }>(`SELECT * FROM app.resolve_public_organization_slug($1::text)`, [slug]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        organizationId: row.organization_id,
        requestedSlug: row.requested_slug,
        canonicalSlug: row.canonical_slug,
        disposition: row.requested_kind === 'alias' ? 'redirect' : 'current',
      };
    },

    async reserveSlug(input) {
      exactOrganizationPrincipal(input.organizationId);
      try {
        return await runDrizzleMutationTransaction(async (tx) => {
          const now = new Date().toISOString();
          const targetCondition = eq(organizationSlugClaims.organizationId, input.organizationId);
          const [collision] = await tx
            .select({ id: organizationSlugClaims.id })
            .from(organizationSlugClaims)
            .where(eq(organizationSlugClaims.slug, input.slug))
            .limit(1)
            .for('update');
          const [existingReservation] = await tx
            .select({ id: organizationSlugClaims.id })
            .from(organizationSlugClaims)
            .where(and(eq(organizationSlugClaims.kind, 'reservation'), targetCondition))
            .limit(1)
            .for('update');

          if (collision && collision.id !== existingReservation?.id) {
            return { ok: false as const, code: 'slug_unavailable' as const };
          }

          const values = {
            slug: input.slug,
            kind: 'reservation',
            organizationId: input.organizationId,
            createdByPlatformUserId: input.actorPlatformUserId,
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
      exactOrganizationPrincipal(input.organizationId);
      try {
        return await runDrizzleMutationTransaction(async (tx) => {
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
          await tx
            .update(organizationSlugClaims)
            .set({
              kind: 'current',
              organizationId: input.organizationId,
              createdByPlatformUserId: input.actorPlatformUserId,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(organizationSlugClaims.id, reservation.id));
          return { ok: true as const, slug: input.slug };
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, code: 'slug_unavailable' };
        throw error;
      }
    },

    async renameSlug(input) {
      exactOrganizationPrincipal(input.organizationId);
      try {
        return await runDrizzleMutationTransaction(async (tx) => {
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

          const [reservation] = await tx
            .select()
            .from(organizationSlugClaims)
            .where(eq(organizationSlugClaims.slug, input.reservedSlug))
            .limit(1)
            .for('update');
          if (!reservation || reservation.kind !== 'reservation') {
            return { ok: false as const, code: 'reservation_not_found' as const };
          }
          if (reservation.organizationId !== input.organizationId) {
            return { ok: false as const, code: 'reservation_owner_mismatch' as const };
          }

          const now = new Date().toISOString();
          await tx
            .delete(organizationSlugClaims)
            .where(eq(organizationSlugClaims.id, reservation.id));
          await tx
            .update(organizationSlugClaims)
            .set({ slug: input.reservedSlug, updatedAt: now })
            .where(eq(organizationSlugClaims.id, current.id));
          await tx
            .update(clinicPublicDirectoryEntries)
            .set({ slug: input.reservedSlug, updatedAt: now })
            .where(eq(clinicPublicDirectoryEntries.organizationId, input.organizationId));
          await tx.insert(organizationSlugClaims).values({
            slug: current.slug,
            kind: 'alias',
            organizationId: input.organizationId,
            createdByPlatformUserId: input.actorPlatformUserId,
            updatedAt: now,
          });
          await tx.insert(organizationSlugRenameEvents).values({
            organizationId: input.organizationId,
            actorPlatformUserId: input.actorPlatformUserId,
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
