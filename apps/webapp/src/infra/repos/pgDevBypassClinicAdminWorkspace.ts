import { and, eq, ne } from 'drizzle-orm';
import { runWebappTransaction } from '@/infra/db/runWebappSql';
import type { DevBypassClinicAdminWorkspacePort } from '@/modules/auth/devBypassClinicAdminWorkspacePort';
import { reconcileDevBypassStaffWorkspace } from '@/modules/auth/devBypassClinicAdminWorkspaceReconciliation';
import {
  beOrganizationMembers,
  beOrganizations,
  beSpecialists,
} from '../../../db/schema/bookingEngine';

/**
 * Idempotently gives each dedicated staff dev-bypass identity one unambiguous workspace.
 * This port is reachable only from the development-only dev-bypass token path.
 */
export const pgDevBypassClinicAdminWorkspacePort: DevBypassClinicAdminWorkspacePort = {
  async ensureStaffWorkspace({ platformUserId, displayName, kind }) {
    await runWebappTransaction(async (tx) => {
      const now = new Date().toISOString();
      const desired = reconcileDevBypassStaffWorkspace({ platformUserId, displayName, kind });

      await tx
        .insert(beOrganizations)
        .values({
          ...desired.organization,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: beOrganizations.id,
          set: {
            title: desired.organization.title,
            isActive: desired.organization.isActive,
            sortOrder: desired.organization.sortOrder,
            updatedAt: now,
          },
        });

      if (desired.specialist) {
        await tx
          .insert(beSpecialists)
          .values({
            ...desired.specialist,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: beSpecialists.id,
            set: {
              organizationId: desired.specialist.organizationId,
              fullName: desired.specialist.fullName,
              isActive: desired.specialist.isActive,
              sortOrder: desired.specialist.sortOrder,
              updatedAt: now,
            },
          });
      }

      // A staff principal must resolve to exactly one active organization. The dedicated dev
      // identity is allowed to be repaired after arbitrary DEV data experiments.
      await tx
        .update(beOrganizationMembers)
        .set({ status: 'disabled', updatedAt: now })
        .where(
          and(
            eq(beOrganizationMembers.platformUserId, platformUserId),
            eq(beOrganizationMembers.status, 'active'),
            ne(beOrganizationMembers.organizationId, desired.organization.id),
          ),
        );

      await tx
        .insert(beOrganizationMembers)
        .values({
          ...desired.membership,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [beOrganizationMembers.organizationId, beOrganizationMembers.platformUserId],
          set: {
            role: desired.membership.role,
            specialistId: desired.membership.specialistId,
            status: desired.membership.status,
            updatedAt: now,
          },
        });
    });
  },
};
