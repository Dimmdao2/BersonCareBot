import { and, eq, isNull } from "drizzle-orm";
import { runWebappPgText, runWebappTransaction } from "@/infra/db/runWebappSql";
import type {
  OrganizationProvisioningPort,
  SpecialistSignupIntent,
} from "@/modules/organization-provisioning/ports";
import { beOrganizationMembers, beSpecialists } from "../../../db/schema/bookingEngine";

type SpecialistSignupIntentDbRow = {
  id: string;
  user_id: string;
  challenge_id: string;
  email_normalized: string;
  organization_title: string;
  specialist_full_name: string;
  status: string;
  provisioned_organization_id: string | null;
  provisioned_specialist_id: string | null;
  provisioned_membership_id: string | null;
};

function mapIntentDbRow(row: SpecialistSignupIntentDbRow): SpecialistSignupIntent {
  if (row.status !== "pending" && row.status !== "provisioned") {
    throw new Error(`Unexpected specialist_signup_intents.status: ${row.status}`);
  }
  return {
    id: row.id,
    userId: row.user_id,
    challengeId: row.challenge_id,
    emailNormalized: row.email_normalized,
    organizationTitle: row.organization_title,
    specialistFullName: row.specialist_full_name,
    status: row.status,
    provisionedOrganizationId: row.provisioned_organization_id,
    provisionedSpecialistId: row.provisioned_specialist_id,
    provisionedMembershipId: row.provisioned_membership_id,
  };
}

export function createPgOrganizationProvisioningPort(): OrganizationProvisioningPort {
  return {
    async createSpecialistSignupIntent(input) {
      await runWebappTransaction(async (tx) => {
        await runWebappPgText(
          `SELECT app.create_specialist_signup_intent($1::uuid, $2::uuid, $3, $4, $5)`,
          [
            input.userId,
            input.challengeId,
            input.emailNormalized,
            input.organizationTitle,
            input.specialistFullName,
          ],
          tx,
        );
      });
    },

    async getPendingSpecialistSignupIntent({ userId, challengeId }) {
      return runWebappTransaction(async (tx) => {
        const result = await runWebappPgText<SpecialistSignupIntentDbRow>(
          `SELECT
             id::text,
             user_id::text,
             challenge_id::text,
             email_normalized,
             organization_title,
             specialist_full_name,
             status,
             provisioned_organization_id::text,
             provisioned_specialist_id::text,
             provisioned_membership_id::text
           FROM app.get_pending_specialist_signup_intent($1::uuid, $2::uuid)`,
          [userId, challengeId],
          tx,
        );
        return result.rows[0] ? mapIntentDbRow(result.rows[0]) : null;
      });
    },

    async getSpecialistSignupIntentByChallengeId(challengeId) {
      return runWebappTransaction(async (tx) => {
        const result = await runWebappPgText<SpecialistSignupIntentDbRow>(
          `SELECT
             id::text,
             user_id::text,
             challenge_id::text,
             email_normalized,
             organization_title,
             specialist_full_name,
             status,
             provisioned_organization_id::text,
             provisioned_specialist_id::text,
             provisioned_membership_id::text
           FROM app.get_specialist_signup_intent_by_challenge($1::uuid)`,
          [challengeId],
          tx,
        );
        return result.rows[0] ? mapIntentDbRow(result.rows[0]) : null;
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
