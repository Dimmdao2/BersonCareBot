import { and, eq, ne, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
  getCurrentDbPrincipalPlatformUserId,
} from '@bersoncare/db-principal';
import type { DrizzleDb } from '@/app-layer/db/drizzle';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  AnonymousPatientSurfaceProjection,
  CustomDomainBindingPort,
  CustomDomainBindingState,
} from '@/modules/custom-domain-binding/ports';
import { orgCustomDomainBindings } from '../../../db/schema';

function exactStaffOrganizationPrincipal(organizationId: string): string {
  const principal = getCurrentDbPrincipal();
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  const actorPlatformUserId = getCurrentDbPrincipalPlatformUserId();
  if (principal?.kind !== 'staff' || !principalOrganizationId || !actorPlatformUserId) {
    throw new Error('staff_principal_required');
  }
  if (principalOrganizationId !== organizationId) {
    throw new Error('organization_principal_mismatch');
  }
  return actorPlatformUserId;
}

async function lockCustomDomainBindings(
  tx: Pick<DrizzleDb, 'execute'>,
  organizationId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('org_custom_domain_bindings:' || ${organizationId}::text, 0))`,
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value.code === '23505' || value.cause?.code === '23505';
}

function mapRow(row: typeof orgCustomDomainBindings.$inferSelect): CustomDomainBindingState {
  return {
    organizationId: row.organizationId!,
    baseDomain: row.baseDomain,
    placement: row.placement as CustomDomainBindingState['placement'],
    subdomainLabel: row.subdomainLabel,
    hostname: row.hostname,
    status: row.status as CustomDomainBindingState['status'],
    statusReason: row.statusReason,
    activatedAt: row.activatedAt,
  };
}

/**
 * PG implementation of `CustomDomainBindingPort` (B2/B8/C5a). The staff write path is plain
 * Drizzle + RLS under an organization advisory lock — same shape as
 * `pgClinicDirectory.ts#reserveSlug` — not a DEFINER wrapper: staff already has direct table access
 * declared in `deploy/postgres/privileges/declaration.ts`. The two anonymous reads and the two
 * infra doors go through the narrow SECURITY DEFINER functions from
 * `db/drizzle-migrations/20260907T090000_org_custom_domain_binding_core.sql`.
 */
export function createPgCustomDomainBindingPort(): CustomDomainBindingPort {
  return {
    async resolveActiveOrganizationByHostname(hostname) {
      const result = await runWebappNamedRoot<{ organization_id: string | null }>(
        getWebappSqlDb(),
        'app.resolve_active_organization_by_custom_domain(text)',
        [hostname],
        sql`SELECT app.resolve_active_organization_by_custom_domain(${hostname}::text)::text AS organization_id`,
      );
      return result.rows[0]?.organization_id ?? null;
    },

    async readAnonymousPatientSurfaceProjection(organizationId) {
      const result = await runWebappNamedRoot<{
        clinic_slug: string;
        skip_public_card_at_root: boolean;
        effective_display_name: string;
        patient_app_name: string;
        accent_token: string;
        logo_url: string | null;
        active_custom_domain_hostname: string | null;
      }>(
        getWebappSqlDb(),
        'app.read_anonymous_patient_surface_projection(uuid)',
        [organizationId],
        sql`SELECT * FROM app.read_anonymous_patient_surface_projection(${organizationId}::uuid)`,
      );
      const row = result.rows[0];
      if (!row) return null;
      const projection: AnonymousPatientSurfaceProjection = {
        clinicSlug: row.clinic_slug,
        skipPublicCardAtRoot: row.skip_public_card_at_root === true,
        effectiveDisplayName: row.effective_display_name,
        patientAppName: row.patient_app_name,
        accentToken: row.accent_token,
        ...(row.logo_url ? { logoUrl: row.logo_url } : {}),
        ...(row.active_custom_domain_hostname
          ? { activeCustomDomainHostname: row.active_custom_domain_hostname }
          : {}),
      };
      return projection;
    },

    async getBindingState(organizationId) {
      exactStaffOrganizationPrincipal(organizationId);
      const [row] = await getDrizzle()
        .select()
        .from(orgCustomDomainBindings)
        .where(
          and(
            eq(orgCustomDomainBindings.organizationId, organizationId),
            ne(orgCustomDomainBindings.status, 'quarantine'),
          ),
        )
        .limit(1);
      return row ? mapRow(row) : null;
    },

    async setCustomDomainIntent(input) {
      exactStaffOrganizationPrincipal(input.organizationId);
      try {
        return await runDrizzleMutationTransaction(async (tx) => {
          await lockCustomDomainBindings(tx, input.organizationId);
          const [existing] = await tx
            .select({
              id: orgCustomDomainBindings.id,
              hostname: orgCustomDomainBindings.hostname,
              status: orgCustomDomainBindings.status,
            })
            .from(orgCustomDomainBindings)
            .where(
              and(
                eq(orgCustomDomainBindings.organizationId, input.organizationId),
                ne(orgCustomDomainBindings.status, 'quarantine'),
              ),
            )
            .limit(1)
            .for('update');
          const hostname =
            input.placement === 'apex'
              ? input.baseDomain
              : `${input.subdomainLabel}.${input.baseDomain}`;
          if (existing?.hostname === hostname) {
            if (existing.status === 'failed') {
              const [retried] = await tx
                .update(orgCustomDomainBindings)
                .set({
                  status: 'pending',
                  statusReason: null,
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(orgCustomDomainBindings.id, existing.id))
                .returning();
              return { ok: true as const, state: retried ? mapRow(retried) : null };
            }
            const [unchanged] = await tx
              .select()
              .from(orgCustomDomainBindings)
              .where(eq(orgCustomDomainBindings.id, existing.id));
            return { ok: true as const, state: unchanged ? mapRow(unchanged) : null };
          }
          // Superseding an existing live binding quarantines it FIRST, in the same transaction: the
          // old hostname stays permanently claimed (B8 anti-squatting), never freed for reuse.
          if (existing) {
            await tx
              .update(orgCustomDomainBindings)
              .set({ status: 'quarantine', updatedAt: new Date().toISOString() })
              .where(eq(orgCustomDomainBindings.id, existing.id));
          }
          const [inserted] = await tx
            .insert(orgCustomDomainBindings)
            .values({
              organizationId: input.organizationId,
              baseDomain: input.baseDomain,
              placement: input.placement,
              subdomainLabel: input.subdomainLabel ?? null,
              hostname,
              status: 'pending',
              createdByPlatformUserId: exactStaffOrganizationPrincipal(input.organizationId),
            })
            .returning();
          return { ok: true as const, state: inserted ? mapRow(inserted) : null };
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, code: 'hostname_taken' };
        throw error;
      }
    },

    async clearCustomDomainIntent(input) {
      exactStaffOrganizationPrincipal(input.organizationId);
      return runDrizzleMutationTransaction(async (tx) => {
        await lockCustomDomainBindings(tx, input.organizationId);
        const [existing] = await tx
          .select({ id: orgCustomDomainBindings.id })
          .from(orgCustomDomainBindings)
          .where(
            and(
              eq(orgCustomDomainBindings.organizationId, input.organizationId),
              ne(orgCustomDomainBindings.status, 'quarantine'),
            ),
          )
          .limit(1)
          .for('update');
        if (!existing) return { ok: false as const, code: 'nothing_to_clear' as const };
        await tx
          .update(orgCustomDomainBindings)
          .set({ status: 'quarantine', updatedAt: new Date().toISOString() })
          .where(eq(orgCustomDomainBindings.id, existing.id));
        return { ok: true as const, state: null };
      });
    },

    async transitionBindingStatus(input) {
      const result = await runWebappNamedRoot<{ ok: boolean; code?: string }>(
        getWebappSqlDb(),
        'app.custom_domain_apply_transition(text,text,text)',
        [input.hostname, input.transition, input.reason ?? null],
        sql`SELECT * FROM jsonb_to_record(
          app.custom_domain_apply_transition(${input.hostname}::text, ${input.transition}::text, ${input.reason ?? null}::text)
        ) AS x(ok boolean, code text)`,
      );
      const row = result.rows[0];
      if (!row || row.ok !== true) {
        return {
          ok: false,
          code: (row?.code as 'not_found' | 'invalid_transition' | undefined) ?? 'not_found',
        };
      }
      return { ok: true };
    },

    async isHostnameAskAuthorized(hostname) {
      const result = await runWebappNamedRoot<{ authorized: boolean }>(
        getWebappSqlDb(),
        'app.custom_domain_ask_is_authorized(text)',
        [hostname],
        sql`SELECT app.custom_domain_ask_is_authorized(${hostname}::text) AS authorized`,
      );
      return result.rows[0]?.authorized === true;
    },
  };
}
