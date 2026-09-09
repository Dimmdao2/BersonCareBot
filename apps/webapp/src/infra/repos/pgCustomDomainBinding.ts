import { and, eq, ne, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
  getCurrentDbPrincipalPlatformUserId,
} from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  AnonymousPatientSurfaceProjection,
  CustomDomainBindingPort,
  CustomDomainBindingState,
} from '@/modules/custom-domain-binding/ports';
import type { ClinicMessengerBots } from '@/shared/lib/surface/requestSurface';
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

type StaffIntentDoorResult =
  | Readonly<{ ok: true; state: CustomDomainBindingState | null }>
  | Readonly<{ ok: false; code: 'hostname_taken' | 'nothing_to_clear' }>;

function staffIntentDoorResult(value: unknown): StaffIntentDoorResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('invalid_custom_domain_binding_intent_result');
  }
  const result = value as { ok?: unknown; code?: unknown; state?: unknown };
  if (result.ok === false && (result.code === 'hostname_taken' || result.code === 'nothing_to_clear')) {
    return { ok: false, code: result.code };
  }
  if (result.ok !== true) throw new Error('invalid_custom_domain_binding_intent_result');
  if (result.state === null) return { ok: true, state: null };
  if (typeof result.state !== 'object' || result.state === null) {
    throw new Error('invalid_custom_domain_binding_intent_result');
  }
  const state = result.state as Partial<CustomDomainBindingState>;
  if (
    typeof state.organizationId !== 'string' ||
    typeof state.baseDomain !== 'string' ||
    (state.placement !== 'apex' && state.placement !== 'subdomain') ||
    typeof state.hostname !== 'string' ||
    !['pending', 'dns_ready', 'active', 'failed', 'suspended', 'quarantine'].includes(
      state.status as string,
    )
  ) {
    throw new Error('invalid_custom_domain_binding_intent_result');
  }
  return { ok: true, state: state as CustomDomainBindingState };
}

/**
 * PG implementation of `CustomDomainBindingPort` (B2/B8/C5a). Staff writes use one narrow intent
 * SECURITY DEFINER root; direct table access remains read-only. The two anonymous reads and two
 * infra doors go through separate narrow SECURITY DEFINER functions from
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
        clinic_messenger_bots: ClinicMessengerBots | null;
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
        ...(row.clinic_messenger_bots && Object.keys(row.clinic_messenger_bots).length > 0
          ? { clinicMessengerBots: row.clinic_messenger_bots }
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
      const result = await runWebappNamedRoot<{ result: unknown }>(
        getWebappSqlDb(),
        'app.save_custom_domain_binding_intent(text,uuid,text,text)',
        ['set', input.organizationId, input.baseDomain, input.placement],
        sql`SELECT app.save_custom_domain_binding_intent(
          ${'set'}::text,
          ${input.organizationId}::uuid,
          ${input.baseDomain}::text,
          ${input.placement}::text
        ) AS result`,
      );
      return staffIntentDoorResult(result.rows[0]?.result);
    },

    async clearCustomDomainIntent(input) {
      exactStaffOrganizationPrincipal(input.organizationId);
      const result = await runWebappNamedRoot<{ result: unknown }>(
        getWebappSqlDb(),
        'app.save_custom_domain_binding_intent(text,uuid,text,text)',
        ['clear', input.organizationId, null, null],
        sql`SELECT app.save_custom_domain_binding_intent(
          ${'clear'}::text,
          ${input.organizationId}::uuid,
          ${null}::text,
          ${null}::text
        ) AS result`,
      );
      return staffIntentDoorResult(result.rows[0]?.result);
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
