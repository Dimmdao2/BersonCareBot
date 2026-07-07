import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  OrganizationMembership,
  OrganizationMemberDirectoryRecord,
  OrganizationMembershipPort,
  OrganizationMembershipRole,
  OrganizationMembershipStatus,
  OrganizationSpecialistDirectoryRecord,
} from "@/modules/organization-membership/ports";
import {
  ORGANIZATION_MEMBERSHIP_ROLES,
  ORGANIZATION_MEMBERSHIP_STATUSES,
} from "@/modules/organization-membership/ports";
import { platformUsers } from "../../../db/schema/schema";
import { beOrganizationMembers, beSpecialists } from "../../../db/schema/bookingEngine";

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

type OrganizationMemberDirectoryRow = {
  id: string;
  organizationId: string;
  platformUserId: string;
  role: string;
  specialistId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  displayName: string | null;
};

function mapOrganizationMemberDirectoryRow(
  row: OrganizationMemberDirectoryRow,
): OrganizationMemberDirectoryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    platformUserId: row.platformUserId,
    role: parseOrganizationMembershipRole(row.role),
    specialistId: row.specialistId,
    status: parseOrganizationMembershipStatus(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    displayName: row.displayName?.trim() || null,
  };
}

function mapOrganizationSpecialistDirectoryRow(
  row: typeof beSpecialists.$inferSelect,
): OrganizationSpecialistDirectoryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fullName: row.fullName,
    isActive: row.isActive,
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

    async listByOrganization(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select({
          id: beOrganizationMembers.id,
          organizationId: beOrganizationMembers.organizationId,
          platformUserId: beOrganizationMembers.platformUserId,
          role: beOrganizationMembers.role,
          specialistId: beOrganizationMembers.specialistId,
          status: beOrganizationMembers.status,
          createdAt: beOrganizationMembers.createdAt,
          updatedAt: beOrganizationMembers.updatedAt,
          displayName: platformUsers.displayName,
        })
        .from(beOrganizationMembers)
        .leftJoin(platformUsers, eq(platformUsers.id, beOrganizationMembers.platformUserId))
        .where(eq(beOrganizationMembers.organizationId, organizationId))
        .orderBy(asc(beOrganizationMembers.createdAt), asc(beOrganizationMembers.platformUserId));
      return rows.map(mapOrganizationMemberDirectoryRow);
    },

    async listSpecialistsByOrganization(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beSpecialists)
        .where(eq(beSpecialists.organizationId, organizationId))
        .orderBy(asc(beSpecialists.sortOrder), asc(beSpecialists.fullName));
      return rows.map(mapOrganizationSpecialistDirectoryRow);
    },
  };
}
