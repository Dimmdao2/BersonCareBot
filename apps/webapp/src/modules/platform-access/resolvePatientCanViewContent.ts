import type { AppSession } from "@/shared/types/session";
import type { EntitlementsService } from "@/modules/entitlements/service";
import { resolvePatientCanViewAuthOnlyContent } from "./resolvePatientCanViewAuthOnlyContent";

/**
 * Patient may view auth-only content if trusted-phone tier applies or an active product grant exists for slug.
 */
export async function resolvePatientCanViewContent(
  session: AppSession | null,
  contentSlug: string,
  entitlements: EntitlementsService | null,
): Promise<boolean> {
  if (await resolvePatientCanViewAuthOnlyContent(session)) {
    return true;
  }
  if (!session?.user?.userId || session.user.role !== "client" || !entitlements) {
    return false;
  }
  return entitlements.hasActiveContentGrant(session.user.userId, contentSlug);
}
