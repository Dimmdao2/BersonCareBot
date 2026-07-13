import {
  ensureDbPrincipalContext,
  enterWithDbPatientPrincipal,
  enterWithDbStaffPrincipal,
  getCurrentDbPrincipal,
} from "@bersoncare/db-principal";
import { createOrganizationMembershipService } from "@/modules/organization-membership/service";
import { createPgOrganizationMembershipPort } from "@/infra/repos/pgOrganizationMembership";
import { canAccessDoctor, canAccessPatient } from "@/modules/roles/service";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import type { AppSession } from "@/shared/types/session";

// NOTE: intentionally does NOT go through `@/app-layer/di/buildAppDeps` — that module imports
// `getCurrentSession` from `@/modules/auth/service`, which is this stamp's own caller
// (service.ts -> sessionPrincipal.ts -> buildAppDeps.ts -> service.ts). A *static* import cycle
// through buildAppDeps is what previously forced this call behind `await import(...)` in
// finalizeCurrentSession — but a dynamic import there breaks the AsyncLocalStorage principal
// stamp's visibility to the route handler that awaits getCurrentSession() (confirmed empirically:
// ~44 doctor/patient/admin routes calling raw getCurrentSession() got no principal under locked
// mode). Constructing the org-membership service directly from its narrow deps (no buildAppDeps)
// lets service.ts import this module statically instead, which is the actual chokepoint fix.
const organizationMembershipService = createOrganizationMembershipService({
  membershipPort: createPgOrganizationMembershipPort(),
});

export async function stampDbPrincipalFromSession(session: AppSession, source: string): Promise<void> {
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
      console.log("DIAG:stampDbPrincipalFromSession:after-enterWith", source, JSON.stringify(getCurrentDbPrincipal()));
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
