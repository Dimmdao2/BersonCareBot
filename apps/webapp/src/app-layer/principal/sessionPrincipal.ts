import {
  ensureDbPrincipalContext,
  enterWithDbPatientPrincipal,
  enterWithDbStaffPrincipal,
} from '@bersoncare/db-principal';
import { createOrganizationMembershipService } from '@/modules/organization-membership/service';
import { createPgOrganizationMembershipPort } from '@/infra/repos/pgOrganizationMembership';
import { createPatientOrganizationService } from '@/modules/patient-organization/service';
import { createPgPatientOrganizationPort } from '@/infra/repos/pgPatientOrganization';
import { canAccessDoctor, canAccessPatient } from '@/modules/roles/service';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import type { AppSession } from '@/shared/types/session';

// NOTE: intentionally does NOT go through `@/app-layer/di/buildAppDeps` — that module imports
// `getCurrentSession` from `@/modules/auth/service`, which is this stamp's own caller
// (service.ts -> sessionPrincipal.ts -> buildAppDeps.ts -> service.ts). Constructing the
// org-membership service directly from its narrow deps (no buildAppDeps) avoids that cycle, so
// service.ts can import stampDbPrincipalFromSession statically instead of via `await import(...)`.
const organizationMembershipService = createOrganizationMembershipService({
  membershipPort: createPgOrganizationMembershipPort(),
});
const patientOrganizationService = createPatientOrganizationService({
  port: createPgPatientOrganizationPort(),
});

export async function stampDbPrincipalFromSession(
  session: AppSession,
  source: string,
  patientOrganizationHint?: string | null,
): Promise<void> {
  // ensureDbPrincipalContext() reuses the caller's cell if one already exists (see its doc
  // comment in packages/db-principal) — it must NOT replace it. getCurrentSession() establishes
  // that cell before its first `await cookies()`; this call keeps it alive rather than orphaning
  // it, so the enterWithDbStaffPrincipal() mutation below is visible all the way back out to
  // whichever route handler is awaiting getCurrentSession().
  ensureDbPrincipalContext({ source: `${source}:pending` });
  if (!isPlatformUserUuid(session.user.userId)) return;

  try {
    if (canAccessDoctor(session.user.role)) {
      const resolved = await organizationMembershipService.resolveOrganizationForUser({
        platformUserId: session.user.userId,
      });
      if (!resolved.ok) {
        // A global admin holds no organization membership row, so resolution above always
        // misses for it — that is the expected, common case here, not an error. Leaving the
        // ambient principal unset left every such session on the bare "bootstrap" pool for the
        // rest of the request: reproduced live on TEST 2026-08-03, `/app/account?tab=notifications`
        // 500'd with "permission denied for table user_web_push_subscriptions" (digest
        // 1641640286) because nothing here ever stamped a principal for it. The identity-self
        // wall (same one `enterStaffSecuritySelfPrincipal` already uses for the account page's
        // security tab) covers exactly a session's own personal-data tables — web push
        // subscriptions, channel/topic notification prefs, profile fields — with no
        // organization required, which is everything a role without a membership can reach.
        enterWithDbPatientPrincipal({
          platformUserId: session.user.userId,
          source: `${source}:doctor-role-no-org-self`,
        });
        return;
      }
      enterWithDbStaffPrincipal({
        organizationId: resolved.context.organizationId,
        platformUserId: session.user.userId,
        source,
      });
      return;
    }

    if (canAccessPatient(session.user.role)) {
      // First establish the patient wall so enrollment resolution is limited to this patient.
      enterWithDbPatientPrincipal({
        platformUserId: session.user.userId,
        source: `${source}:patient-enrollment-resolution`,
      });
      const resolved = await patientOrganizationService.resolveActiveOrganizationForPatient(
        session.user.userId,
        { rememberedOrganizationId: patientOrganizationHint },
      );
      if (!resolved.ok) return;
      enterWithDbPatientPrincipal({
        organizationId: resolved.organizationId,
        platformUserId: session.user.userId,
        source,
      });
    }
  } catch {
    return;
  }
}
