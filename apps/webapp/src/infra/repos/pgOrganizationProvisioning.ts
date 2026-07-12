import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { runWebappTransaction } from "@/infra/db/runWebappSql";
import type {
  OrganizationProvisioningPort,
  SpecialistSignupIntent,
} from "@/modules/organization-provisioning/ports";
import { platformUsers } from "../../../db/schema/schema";
import { beOrganizationMembers, beOrganizations, beSpecialists } from "../../../db/schema/bookingEngine";
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
        const intents = await tx
          .select()
          .from(specialistSignupIntents)
          .where(
            and(
              eq(specialistSignupIntents.userId, userId),
              eq(specialistSignupIntents.challengeId, challengeId),
              eq(specialistSignupIntents.status, "pending"),
            ),
          )
          .limit(1)
          .for("update");
        let intent = intents[0] ? mapIntentRow(intents[0]) : null;
        if (!intent) {
          const provisionedRows = await tx
            .select()
            .from(specialistSignupIntents)
            .where(
              and(
                eq(specialistSignupIntents.userId, userId),
                eq(specialistSignupIntents.challengeId, challengeId),
                eq(specialistSignupIntents.status, "provisioned"),
              ),
            )
            .limit(1)
            .for("update");
          intent = provisionedRows[0] ? mapIntentRow(provisionedRows[0]) : null;
          if (
            intent?.provisionedOrganizationId &&
            intent.provisionedSpecialistId &&
            intent.provisionedMembershipId
          ) {
            return {
              organizationId: intent.provisionedOrganizationId,
              specialistId: intent.provisionedSpecialistId,
              membershipId: intent.provisionedMembershipId,
            };
          }
          throw new Error("specialist_signup_intent_not_found");
        }

        const now = new Date().toISOString();
        const userRows = await tx
          .update(platformUsers)
          .set({
            role: "doctor",
            displayName: intent.specialistFullName,
            updatedAt: now,
          })
          .where(
            and(
              eq(platformUsers.id, userId),
              isNull(platformUsers.mergedIntoId),
              isNotNull(platformUsers.emailVerifiedAt),
            ),
          )
          .returning({ id: platformUsers.id });
        if (!userRows[0]) {
          throw new Error("specialist_signup_user_not_verified");
        }

        const organizationId = randomUUID();
        const organizations = await tx
          .insert(beOrganizations)
          .values({
            id: organizationId,
            title: intent.organizationTitle,
            isActive: true,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: beOrganizations.id });

        const specialists = await tx
          .insert(beSpecialists)
          .values({
            organizationId,
            fullName: intent.specialistFullName,
            isActive: true,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: beSpecialists.id });

        const specialistId = specialists[0]?.id;
        if (!organizations[0]?.id || !specialistId) {
          throw new Error("specialist_signup_provision_insert_failed");
        }

        const memberships = await tx
          .insert(beOrganizationMembers)
          .values({
            organizationId,
            platformUserId: userId,
            role: "owner",
            specialistId,
            status: "active",
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: beOrganizationMembers.id });

        const membershipId = memberships[0]?.id;
        if (!membershipId) {
          throw new Error("specialist_signup_membership_insert_failed");
        }

        await tx
          .update(specialistSignupIntents)
          .set({
            status: "provisioned",
            provisionedOrganizationId: organizationId,
            provisionedSpecialistId: specialistId,
            provisionedMembershipId: membershipId,
            provisionedAt: now,
          })
          .where(eq(specialistSignupIntents.id, intent.id));

        return { organizationId, specialistId, membershipId };
      });
    },
  };
}
