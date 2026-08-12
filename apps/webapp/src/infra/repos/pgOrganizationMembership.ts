import { and, asc, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  OrganizationMembership,
  OrganizationMemberDirectoryRecord,
  OrganizationMembershipPort,
  OrganizationMembershipRole,
  OrganizationMembershipStatus,
  OrganizationSpecialistDirectoryRecord,
} from '@/modules/organization-membership/ports';
import {
  ORGANIZATION_MEMBERSHIP_ROLES,
  ORGANIZATION_MEMBERSHIP_STATUSES,
} from '@/modules/organization-membership/ports';
import { platformUsers, userIdentity } from '../../../db/schema/schema';
import { drizzleFioCols, drizzleUserIdentityFioJoin } from '@/infra/repos/userIdentityFioSql';
import { beOrganizationMembers, beSpecialists } from '../../../db/schema/bookingEngine';

type OrganizationMembershipRow = typeof beOrganizationMembers.$inferSelect;

type WorkspaceResolutionMembershipRow = {
  id: string;
  organization_id: string;
  platform_user_id: string;
  role: string;
  specialist_id: string | null;
  status: string;
  doctor_screens_disabled: boolean;
  created_at: string;
  updated_at: string;
};

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
    doctorScreensDisabled: row.doctorScreensDisabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapWorkspaceResolutionMembershipRow(
  row: WorkspaceResolutionMembershipRow,
): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organization_id,
    platformUserId: row.platform_user_id,
    role: parseOrganizationMembershipRole(row.role),
    specialistId: row.specialist_id,
    status: parseOrganizationMembershipStatus(row.status),
    doctorScreensDisabled: row.doctor_screens_disabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type OrganizationMemberDirectoryRow = {
  id: string;
  organizationId: string;
  platformUserId: string;
  role: string;
  specialistId: string | null;
  status: string;
  doctorScreensDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  displayName: string | null;
};

type PlatformOrganizationMemberDirectoryRow = {
  id: string;
  organization_id: string;
  platform_user_id: string;
  role: string;
  specialist_id: string | null;
  status: string;
  doctor_screens_disabled: boolean;
  created_at: string;
  updated_at: string;
  display_name: string | null;
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
    doctorScreensDisabled: row.doctorScreensDisabled,
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
            eq(beOrganizationMembers.status, 'active'),
          ),
        )
        .orderBy(asc(beOrganizationMembers.createdAt), asc(beOrganizationMembers.organizationId));
      return rows.map(mapOrganizationMembershipRow);
    },

    async listActiveForWorkspaceResolution(platformUserId) {
      const result = await runWebappNamedRoot<WorkspaceResolutionMembershipRow>(
        getWebappSqlDb(),
        'app.resolve_staff_workspace_memberships(uuid)',
        [platformUserId],
        sql`SELECT * FROM app.resolve_staff_workspace_memberships(${platformUserId}::uuid)`,
      );
      return result.rows.map(mapWorkspaceResolutionMembershipRow);
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
          doctorScreensDisabled: beOrganizationMembers.doctorScreensDisabled,
          createdAt: beOrganizationMembers.createdAt,
          updatedAt: beOrganizationMembers.updatedAt,
          displayName: drizzleFioCols.displayName,
        })
        .from(beOrganizationMembers)
        .leftJoin(platformUsers, eq(platformUsers.id, beOrganizationMembers.platformUserId))
        .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
        .where(eq(beOrganizationMembers.organizationId, organizationId))
        .orderBy(asc(beOrganizationMembers.createdAt), asc(beOrganizationMembers.platformUserId));
      return rows.map(mapOrganizationMemberDirectoryRow);
    },

    async listPlatformDirectoryByOrganization(organizationId) {
      const result = await getDrizzle().execute(sql`
        SELECT
          membership_id::text AS id,
          organization_id::text AS organization_id,
          platform_user_id::text AS platform_user_id,
          membership_role AS role,
          specialist_id::text AS specialist_id,
          membership_status AS status,
          doctor_screens_disabled,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          display_name
        FROM app.list_platform_organization_members(${organizationId}::uuid)
      `);
      return (result.rows as PlatformOrganizationMemberDirectoryRow[]).map((row) =>
        mapOrganizationMemberDirectoryRow({
          id: row.id,
          organizationId: row.organization_id,
          platformUserId: row.platform_user_id,
          role: row.role,
          specialistId: row.specialist_id,
          status: row.status,
          doctorScreensDisabled: row.doctor_screens_disabled,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          displayName: row.display_name,
        }),
      );
    },

    async getMemberByOrganization({ organizationId, membershipId }) {
      const db = getDrizzle();
      const rows = await db
        .select({
          id: beOrganizationMembers.id,
          organizationId: beOrganizationMembers.organizationId,
          platformUserId: beOrganizationMembers.platformUserId,
          role: beOrganizationMembers.role,
          specialistId: beOrganizationMembers.specialistId,
          status: beOrganizationMembers.status,
          doctorScreensDisabled: beOrganizationMembers.doctorScreensDisabled,
          createdAt: beOrganizationMembers.createdAt,
          updatedAt: beOrganizationMembers.updatedAt,
          displayName: drizzleFioCols.displayName,
        })
        .from(beOrganizationMembers)
        .leftJoin(platformUsers, eq(platformUsers.id, beOrganizationMembers.platformUserId))
        .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
        .where(
          and(
            eq(beOrganizationMembers.organizationId, organizationId),
            eq(beOrganizationMembers.id, membershipId),
          ),
        )
        .orderBy(asc(beOrganizationMembers.createdAt));
      return rows[0] ? mapOrganizationMemberDirectoryRow(rows[0]) : null;
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

    async getSpecialistByOrganization({ organizationId, specialistId }) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beSpecialists)
        .where(
          and(eq(beSpecialists.organizationId, organizationId), eq(beSpecialists.id, specialistId)),
        )
        .orderBy(asc(beSpecialists.sortOrder), asc(beSpecialists.fullName));
      return rows[0] ? mapOrganizationSpecialistDirectoryRow(rows[0]) : null;
    },

    async setDoctorScreensDisabled({ membershipId, disabled }) {
      const db = getDrizzle();
      await db
        .update(beOrganizationMembers)
        .set({ doctorScreensDisabled: disabled, updatedAt: sql`now()` })
        .where(eq(beOrganizationMembers.id, membershipId));
    },
  };
}
