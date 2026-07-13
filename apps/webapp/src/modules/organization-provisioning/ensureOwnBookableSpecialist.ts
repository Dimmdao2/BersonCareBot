import type { OrganizationMembershipRole } from "@/modules/organization-membership/ports";
import type { OrganizationProvisioningPort } from "./ports";

const DEFAULT_BOOKABLE_MEMBERSHIP_ROLES: readonly OrganizationMembershipRole[] = ["owner", "doctor"];

export type EnsureOwnBookableSpecialistContext = {
  organizationId: string;
  membershipId: string;
  membershipRole: OrganizationMembershipRole;
  specialistId: string | null;
  displayName: string;
};

export type EnsureOwnBookableSpecialistOptions = {
  bookableMembershipRoles?: readonly OrganizationMembershipRole[];
};

export async function ensureOwnBookableSpecialist(
  provisioningPort: OrganizationProvisioningPort,
  ctx: EnsureOwnBookableSpecialistContext,
  options: EnsureOwnBookableSpecialistOptions = {},
): Promise<string | null> {
  if (ctx.specialistId) return ctx.specialistId;

  const bookableRoles = options.bookableMembershipRoles ?? DEFAULT_BOOKABLE_MEMBERSHIP_ROLES;
  if (!bookableRoles.includes(ctx.membershipRole)) return null;

  const fullName = ctx.displayName.trim();
  if (!fullName) return null;

  const result = await provisioningPort.ensureOwnBookableSpecialist({
    organizationId: ctx.organizationId,
    membershipId: ctx.membershipId,
    fullName,
  });
  return result.specialistId;
}
