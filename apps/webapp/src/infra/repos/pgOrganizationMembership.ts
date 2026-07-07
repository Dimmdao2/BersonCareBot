import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  OrganizationMembership,
  OrganizationMembershipPort,
  OrganizationMembershipRole,
  OrganizationMembershipStatus,
} from "@/modules/organization-membership/ports";
import {
  ORGANIZATION_MEMBERSHIP_ROLES,
  ORGANIZATION_MEMBERSHIP_STATUSES,
} from "@/modules/organization-membership/ports";
import { beOrganizationMembers } from "../../../db/schema/bookingEngine";

type OrganizationMembershipRow = typeof beOrganizationMembers.$inferSelect;

function isOrganizationMembershipRole(value: string): value is OrganizationMembershipRole {
  return ORGANIZATION_MEMBERSHIP_ROLES.includes(value as OrganizationMembershipRole);
}

function isOrganizationMembershipStatus(value: string): value is OrganizationMembershipStatus {
  return ORGANIZATION_MEMBERSHIP_STATUSES.includes(value as OrganizationMembershipStatus);
}

function parseOrganizationMembershipRole(value: string): OrganizationMembershipRole {
  if (isOrganizationMembershipRole(value)) return value;
  throw new Error(`Unexpected be_organization_members.role: ${value}`);
}

function parseOrganizationMembershipStatus(value: string): OrganizationMembershipStatus {
  if (isOrganizationMembershipStatus(value)) return value;
  throw new Error(`Unexpected be_organization_members.status: ${value}`);
}

function mapOrganizationMembershipRow(row: OrganizationMembershipRow): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organizationId,
    platformUserId: row.platformUserId,
    role: parseOrganizationMembershipRole(row.role),
    specialistId: row.specialistId,
    status: parseOrganizationMembershipStatus(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPgOrganizationMembershipPort(): OrganizationMembershipPort {
  return {
    async listByPlatformUser(platformUserId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beOrganizationMembers)
        .where(eq(beOrganizationMembers.platformUserId, platformUserId))
        .orderBy(asc(beOrganizationMembers.createdAt), asc(beOrganizationMembers.organizationId));
      return rows.map(mapOrganizationMembershipRow);
    },

    async listActiveByPlatformUser(platformUserId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beOrganizationMembers)
        .where(
          and(
            eq(beOrganizationMembers.platformUserId, platformUserId),
            eq(beOrganizationMembers.status, "active"),
          ),
        )
        .orderBy(asc(beOrganizationMembers.createdAt), asc(beOrganizationMembers.organizationId));
      return rows.map(mapOrganizationMembershipRow);
    },
  };
}
