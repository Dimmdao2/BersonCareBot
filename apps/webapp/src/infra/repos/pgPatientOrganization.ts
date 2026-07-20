import { and, eq, isNull } from "drizzle-orm";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { runWithWebappDbOperationFamily } from "@/infra/db/saasIsolationOperationContext";
import { runWebappPgText } from "@/infra/db/runWebappSql";
import { toIsoStringSafe } from "@/shared/lib/toIsoStringSafe";
import type {
  CreateManualOrganizationClientResult,
  PatientOrganizationEnrollment,
  PatientOrganizationPort,
} from "@/modules/patient-organization/ports";
import { orgEnrollments } from "../../../db/schema/bookingEngine";
import { platformUsers, userPhoneHistory } from "../../../db/schema/schema";

type ActiveOrganizationRow = {
  organization_id: string;
  organization_title: string;
  platform_user_id: string;
  enrollment_created_at: Date | string;
};

type PgErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

type ManualClientCreateError =
  | "email_conflict"
  | "identity_conflict"
  | "inactive_enrollment";

class ManualClientCreateAbort extends Error {
  constructor(readonly code: ManualClientCreateError) {
    super(code);
  }
}

function mapOrgEnrollment(row: ActiveOrganizationRow): PatientOrganizationEnrollment {
  return {
    organizationId: row.organization_id,
    organizationTitle: row.organization_title,
    platformUserId: row.platform_user_id,
    status: "active",
    organizationIsActive: true,
    createdAt: toIsoStringSafe(row.enrollment_created_at),
  };
}

function requiredExactOrganizationPrincipal(organizationId: string): void {
  if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
    throw new Error("organization_principal_mismatch");
  }
}

function pgConstraint(error: unknown): { code: string; constraint: string } {
  if (typeof error !== "object" || error === null) return { code: "", constraint: "" };
  const value = error as PgErrorLike;
  return {
    code: typeof value.code === "string" ? value.code : "",
    constraint: typeof value.constraint === "string" ? value.constraint : "",
  };
}

export function createPgPatientOrganizationPort(): PatientOrganizationPort {
  return {
    async listActiveEnrollmentsByPlatformUser(platformUserId) {
      void platformUserId;
      const result = await runWithWebappDbOperationFamily("patient_ui_config", () =>
        runWebappPgText<ActiveOrganizationRow>(
          "SELECT * FROM app.read_current_patient_active_organizations()",
        ),
      );
      return result.rows.map(mapOrgEnrollment);
    },
    async hasActiveEnrollment(platformUserId, organizationId) {
      if (getCurrentDbPrincipalOrganizationId() !== organizationId) return false;
      const db = getDrizzle();
      const [row] = await db
        .select({ organizationId: orgEnrollments.organizationId })
        .from(orgEnrollments)
        .where(
          and(
            eq(orgEnrollments.organizationId, organizationId),
            eq(orgEnrollments.platformUserId, platformUserId),
            eq(orgEnrollments.status, "active"),
          ),
        )
        .limit(1);
      return row?.organizationId === organizationId;
    },
    async createManualOrganizationClient(input): Promise<CreateManualOrganizationClientResult> {
      requiredExactOrganizationPrincipal(input.organizationId);
      const db = getDrizzle();

      try {
        return await db.transaction(async (tx) => {
          const [existingByPhone] = await tx
            .select({
              id: platformUsers.id,
              role: platformUsers.role,
              displayName: platformUsers.displayName,
              phoneNormalized: platformUsers.phoneNormalized,
            })
            .from(platformUsers)
            .where(
              and(
                eq(platformUsers.phoneNormalized, input.phoneNormalized),
                isNull(platformUsers.mergedIntoId),
              ),
            )
            .limit(1);

          if (existingByPhone && existingByPhone.role !== "client") {
            throw new ManualClientCreateAbort("identity_conflict");
          }

          if (input.emailNormalized) {
            const [emailOwner] = await tx
              .select({ id: platformUsers.id })
              .from(platformUsers)
              .where(
                and(
                  eq(platformUsers.emailNormalized, input.emailNormalized),
                  isNull(platformUsers.mergedIntoId),
                ),
              )
              .limit(1);
            if (emailOwner && emailOwner.id !== existingByPhone?.id) {
              throw new ManualClientCreateAbort("email_conflict");
            }
          }

          let userId = existingByPhone?.id ?? null;
          let displayName = existingByPhone?.displayName ?? input.displayName;
          let created = false;

          if (!userId) {
            const [inserted] = await tx
              .insert(platformUsers)
              .values({
                phoneNormalized: input.phoneNormalized,
                displayName: input.displayName,
                email: input.emailRaw,
                emailNormalized: input.emailNormalized,
                role: "client",
                patientPhoneTrustAt: new Date().toISOString(),
              })
              .onConflictDoNothing({ target: platformUsers.phoneNormalized })
              .returning({ id: platformUsers.id, displayName: platformUsers.displayName });

            if (inserted) {
              userId = inserted.id;
              displayName = inserted.displayName;
              created = true;
              await tx.insert(userPhoneHistory).values({
                platformUserId: userId,
                organizationId: input.organizationId,
                phoneNormalized: input.phoneNormalized,
                source: "admin",
              });
            } else {
              const [concurrent] = await tx
                .select({
                  id: platformUsers.id,
                  role: platformUsers.role,
                  displayName: platformUsers.displayName,
                })
                .from(platformUsers)
                .where(
                  and(
                    eq(platformUsers.phoneNormalized, input.phoneNormalized),
                    isNull(platformUsers.mergedIntoId),
                  ),
                )
                .limit(1);
              if (!concurrent || concurrent.role !== "client") {
                throw new ManualClientCreateAbort("identity_conflict");
              }
              userId = concurrent.id;
              displayName = concurrent.displayName;
            }
          }

          const [existingEnrollment] = await tx
            .select({ status: orgEnrollments.status })
            .from(orgEnrollments)
            .where(
              and(
                eq(orgEnrollments.organizationId, input.organizationId),
                eq(orgEnrollments.platformUserId, userId),
              ),
            )
            .limit(1);

          if (
            existingEnrollment &&
            existingEnrollment.status !== "active" &&
            existingEnrollment.status !== "invited"
          ) {
            throw new ManualClientCreateAbort("inactive_enrollment");
          }

          if (!existingEnrollment) {
            await tx
              .insert(orgEnrollments)
              .values({
                organizationId: input.organizationId,
                platformUserId: userId,
                status: "active",
              })
              .onConflictDoNothing({
                target: [orgEnrollments.organizationId, orgEnrollments.platformUserId],
              });
          } else if (existingEnrollment.status === "invited") {
            await tx
              .update(orgEnrollments)
              .set({ status: "active" })
              .where(
                and(
                  eq(orgEnrollments.organizationId, input.organizationId),
                  eq(orgEnrollments.platformUserId, userId),
                  eq(orgEnrollments.status, "invited"),
                ),
              );
          }

          const [activeEnrollment] = await tx
            .select({ id: orgEnrollments.id })
            .from(orgEnrollments)
            .where(
              and(
                eq(orgEnrollments.organizationId, input.organizationId),
                eq(orgEnrollments.platformUserId, userId),
                eq(orgEnrollments.status, "active"),
              ),
            )
            .limit(1);
          if (!activeEnrollment) throw new ManualClientCreateAbort("inactive_enrollment");

          return {
            ok: true,
            userId,
            displayName,
            phoneNormalized: input.phoneNormalized,
            created,
          };
        });
      } catch (error) {
        if (error instanceof ManualClientCreateAbort) {
          return { ok: false, error: error.code };
        }
        const pg = pgConstraint(error);
        if (pg.code === "23505" && pg.constraint === "uq_platform_users_email_normalized_active") {
          return { ok: false, error: "email_conflict" };
        }
        return { ok: false, error: "create_failed" };
      }
    },
    async findTreatmentProgramOrganizationForPatient(platformUserId, instanceId) {
      void platformUserId;
      const result = await runWithWebappDbOperationFamily("patient_ui_config", () =>
        runWebappPgText<{ organization_id: string | null }>(
          "SELECT app.resolve_current_patient_treatment_program_organization($1::uuid) AS organization_id",
          [instanceId],
        ),
      );
      return result.rows[0]?.organization_id ?? null;
    },
  };
}
