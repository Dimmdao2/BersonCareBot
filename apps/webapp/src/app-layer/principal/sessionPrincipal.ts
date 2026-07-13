import {
  ensureDbPrincipalContext,
  enterWithDbPatientPrincipal,
  enterWithDbStaffPrincipal,
} from "@bersoncare/db-principal";
import { createOrganizationMembershipService } from "@/modules/organization-membership/service";
import { createPgOrganizationMembershipPort } from "@/infra/repos/pgOrganizationMembership";
import { canAccessDoctor, canAccessPatient } from "@/modules/roles/service";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import type { AppSession } from "@/shared/types/session";

// NOTE: intentionally does NOT go through `@/app-layer/di/buildAppDeps` — that module imports
// `getCurrentSession` from `@/modules/auth/service`, which is this stamp's own caller
// (service.ts -> sessionPrincipal.ts -> buildAppDeps.ts -> service.ts). Constructing the
// org-membership service directly from its narrow deps (no buildAppDeps) avoids that cycle, so
// service.ts can import stampDbPrincipalFromSession statically instead of via `await import(...)`.
const organizationMembershipService = createOrganizationMembershipService({
  membershipPort: createPgOrganizationMembershipPort(),
});

export async function stampDbPrincipalFromSession(session: AppSession, source: string): Promise<void> {
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
      if (!resolved.ok) return;
      enterWithDbStaffPrincipal({
        organizationId: resolved.context.organizationId,
        platformUserId: session.user.userId,
        source,
      });
      return;
    }

    if (canAccessPatient(session.user.role)) {
      enterWithDbPatientPrincipal({
        platformUserId: session.user.userId,
        source,
      });
    }
  } catch {
    return;
  }
}
