import type { OrganizationMembershipRole } from "@/modules/organization-membership/ports";
import type { OrganizationProvisioningPort } from "./ports";

export type EnsureOwnBookableSpecialistContext = {
  organizationId: string;
  membershipId: string;
  platformUserId: string;
  membershipRole: OrganizationMembershipRole;
  specialistId: string | null;
  displayName: string;
};

export async function ensureOwnBookableSpecialist(
  provisioningPort: OrganizationProvisioningPort,
  ctx: EnsureOwnBookableSpecialistContext,
): Promise<string | null> {
  if (ctx.specialistId) return ctx.specialistId;

  if (ctx.membershipRole !== "owner") return null;

  const fullName = ctx.displayName.trim();
  if (!fullName) return null;

  const result = await provisioningPort.ensureOwnBookableSpecialist({
    organizationId: ctx.organizationId,
    membershipId: ctx.membershipId,
    platformUserId: ctx.platformUserId,
    fullName,
  });
  return result.specialistId;
}
