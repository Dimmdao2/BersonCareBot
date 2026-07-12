import {
  ensureDbPrincipalContext,
  enterWithDbPatientPrincipal,
  enterWithDbStaffPrincipal,
} from "@bersoncare/db-principal";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { canAccessDoctor, canAccessPatient } from "@/modules/roles/service";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import type { AppSession } from "@/shared/types/session";

export async function stampDbPrincipalFromSession(session: AppSession, source: string): Promise<void> {
  ensureDbPrincipalContext({ source: `${source}:pending` });
  if (!isPlatformUserUuid(session.user.userId)) return;

  try {
    if (canAccessDoctor(session.user.role)) {
      const resolved = await buildAppDeps().organizationMembership.resolveOrganizationForUser({
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
