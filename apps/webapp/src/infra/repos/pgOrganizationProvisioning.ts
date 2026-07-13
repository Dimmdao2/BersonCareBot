import { and, eq, isNull } from "drizzle-orm";
import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import type {
  OrganizationProvisioningPort,
  SpecialistSignupIntent,
} from "@/modules/organization-provisioning/ports";
import { beOrganizationMembers, beSpecialists } from "../../../db/schema/bookingEngine";
import { specialistSignupIntents } from "../../../db/schema/specialistSignupIntents";

function mapIntentRow(row: typeof specialistSignupIntents.$inferSelect): SpecialistSignupIntent {
  if (row.status !== "pending" && row.status !== "provisioned") {
    throw new Error(`Unexpected specialist_signup_intents.status: ${row.status}`);
  }
  return {
    id: row.id,
    userId: row.userId,
    challengeId: row.challengeId,
    emailNormalized: row.emailNormalized,
    organizationTitle: row.organizationTitle,
    specialistFullName: row.specialistFullName,
    status: row.status,
    provisionedOrganizationId: row.provisionedOrganizationId,
    provisionedSpecialistId: row.provisionedSpecialistId,
    provisionedMembershipId: row.provisionedMembershipId,
  };
}

export function createPgOrganizationProvisioningPort(): OrganizationProvisioningPort {
  return {
    async createSpecialistSignupIntent(input) {
      await runWebappTransaction(async (tx) => {
        await tx.insert(specialistSignupIntents).values({
          userId: input.userId,
          challengeId: input.challengeId,
          emailNormalized: input.emailNormalized,
          organizationTitle: input.organizationTitle,
          specialistFullName: input.specialistFullName,
        });
      });
    },

    async getPendingSpecialistSignupIntent({ userId, challengeId }) {
      return runWebappTransaction(async (tx) => {
        const rows = await tx
          .select()
          .from(specialistSignupIntents)
          .where(
            and(
              eq(specialistSignupIntents.userId, userId),
              eq(specialistSignupIntents.challengeId, challengeId),
              eq(specialistSignupIntents.status, "pending"),
            ),
          )
          .limit(1);
        return rows[0] ? mapIntentRow(rows[0]) : null;
      });
    },

    async getSpecialistSignupIntentByChallengeId(challengeId) {
      return runWebappTransaction(async (tx) => {
        const rows = await tx
          .select()
          .from(specialistSignupIntents)
          .where(eq(specialistSignupIntents.challengeId, challengeId))
          .limit(1);
        return rows[0] ? mapIntentRow(rows[0]) : null;
      });
    },

    async provisionSpecialistOwner({ userId, challengeId }) {
      return runWebappTransaction(async (tx) => {
        const result = await runWebappPgText<{
          ok: boolean;
          code: string | null;
          organization_id: string | null;
          specialist_id: string | null;
          membership_id: string | null;
        }>("SELECT * FROM app.provision_specialist_owner($1, $2)", [userId, challengeId], tx);
        const row = result.rows[0];
        if (!row) {
          throw new Error("specialist_signup_provision_insert_failed");
        }
        if (!row.ok) {
          throw new Error(row.code ?? "specialist_signup_provision_insert_failed");
        }
        if (!row.organization_id || !row.membership_id) {
          throw new Error("specialist_signup_provision_insert_failed");
        }
        return {
          organizationId: row.organization_id,
          specialistId: row.specialist_id,
          membershipId: row.membership_id,
        };
      });
    },

    async ensureOwnBookableSpecialist({ organizationId, membershipId, fullName }) {
      return runWebappTransaction(async (tx) => {
        const membershipRows = await tx
          .select({
            id: beOrganizationMembers.id,
            specialistId: beOrganizationMembers.specialistId,
          })
          .from(beOrganizationMembers)
          .where(
            and(
              eq(beOrganizationMembers.id, membershipId),
              eq(beOrganizationMembers.organizationId, organizationId),
            ),
          )
          .limit(1)
          .for("update");
        const membership = membershipRows[0];
        if (!membership) {
          throw new Error("organization_membership_not_found");
        }
        if (membership.specialistId) {
          return { specialistId: membership.specialistId, created: false };
        }

        const now = new Date().toISOString();
        const specialists = await tx
          .insert(beSpecialists)
          .values({
            organizationId,
            fullName,
            isActive: true,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: beSpecialists.id });
        const specialistId = specialists[0]?.id;
        if (!specialistId) {
          throw new Error("specialist_provision_insert_failed");
        }

        const update = await tx
          .update(beOrganizationMembers)
          .set({
            specialistId,
            updatedAt: now,
          })
          .where(
            and(
              eq(beOrganizationMembers.id, membershipId),
              eq(beOrganizationMembers.organizationId, organizationId),
              isNull(beOrganizationMembers.specialistId),
            ),
          );
        if ((update.rowCount ?? 0) < 1) {
          throw new Error("specialist_membership_backfill_conflict");
        }

        return { specialistId, created: true };
      });
    },
  };
}
