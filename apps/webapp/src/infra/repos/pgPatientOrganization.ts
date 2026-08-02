import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';
import type {
  CreateManualOrganizationClientResult,
  PatientOrganizationEnrollment,
  PatientOrganizationPort,
} from '@/modules/patient-organization/ports';
import {
  DoctorClientIdentityError,
  resolveOrCreateDoctorClientByPhoneInTransaction,
} from '@/infra/repos/pgDoctorClientCreate';
import {
  ensureInvitedOrganizationClientRelationship,
  OrganizationClientRelationshipDeniedError,
} from '@/infra/repos/pgPatientOrganizationEnrollment';
import { StockQuotaReachedError } from '@/infra/repos/transactionQuotaPort';
import {
  assertManualPatientCommandReplay,
  findManualPatientCommand,
  insertManualPatientCommand,
  isManualPatientCommandUniqueViolation,
  lockManualPatientCommand,
  manualPatientCommandFingerprint,
} from '@/infra/repos/pgManualPatientCommand';
import { beAppointments, orgEnrollments } from '../../../db/schema/bookingEngine';
import { clinicalVisit } from '../../../db/schema/patientClinical';
import { platformUsers } from '../../../db/schema/schema';

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

function mapOrgEnrollment(row: ActiveOrganizationRow): PatientOrganizationEnrollment {
  return {
    organizationId: row.organization_id,
    organizationTitle: row.organization_title,
    platformUserId: row.platform_user_id,
    status: 'active',
    organizationIsActive: true,
    createdAt: toIsoStringSafe(row.enrollment_created_at),
  };
}

function requiredExactOrganizationPrincipal(organizationId: string): void {
  if (getCurrentDbPrincipalOrganizationId() !== organizationId) {
    throw new Error('organization_principal_mismatch');
  }
}

function pgConstraint(error: unknown): { code: string; constraint: string } {
  if (typeof error !== 'object' || error === null) return { code: '', constraint: '' };
  const value = error as PgErrorLike;
  return {
    code: typeof value.code === 'string' ? value.code : '',
    constraint: typeof value.constraint === 'string' ? value.constraint : '',
  };
}

export function createPgPatientOrganizationPort(): PatientOrganizationPort {
  return {
    async listActiveEnrollmentsByPlatformUser(platformUserId) {
      void platformUserId;
      const result = await runWithWebappDbOperationFamily('patient_ui_config', () =>
        runWebappPgText<ActiveOrganizationRow>(
          'SELECT * FROM app.read_current_patient_active_organizations()',
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
            eq(orgEnrollments.status, 'active'),
          ),
        )
        .limit(1);
      return row?.organizationId === organizationId;
    },
    async hasSchedulableClientRelationship(platformUserId, organizationId) {
      if (getCurrentDbPrincipalOrganizationId() !== organizationId) return false;
      const db = getDrizzle();
      const [row] = await db
        .select({ organizationId: orgEnrollments.organizationId })
        .from(orgEnrollments)
        .where(
          and(
            eq(orgEnrollments.organizationId, organizationId),
            eq(orgEnrollments.platformUserId, platformUserId),
            inArray(orgEnrollments.status, ['invited', 'active']),
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
          const isStandaloneNoContact =
            input.phoneNormalized === null &&
            input.emailRaw === null &&
            input.emailNormalized === null;
          const commandId = input.commandId?.trim();
          const requestFingerprint = isStandaloneNoContact
            ? manualPatientCommandFingerprint({
                kind: 'standalone_no_contact_card',
                identity: {
                  lastName: input.lastName,
                  firstName: input.firstName,
                  patronymic: input.patronymic,
                  phoneNormalized: input.phoneNormalized,
                  emailRaw: input.emailRaw,
                  emailNormalized: input.emailNormalized,
                },
              })
            : null;

          if (isStandaloneNoContact) {
            if (!commandId || !requestFingerprint) return { ok: false, error: 'create_failed' };
            await lockManualPatientCommand(tx, commandId);
            const existingCommand = await findManualPatientCommand(tx, commandId);
            if (existingCommand) {
              assertManualPatientCommandReplay(existingCommand, {
                organizationId: input.organizationId,
                commandKind: 'standalone_no_contact_card',
                requestFingerprint,
              });
              const [patient] = await tx
                .select({
                  userId: platformUsers.id,
                  displayName: platformUsers.displayName,
                  lastName: platformUsers.lastName,
                  firstName: platformUsers.firstName,
                  patronymic: platformUsers.patronymic,
                  phoneNormalized: platformUsers.phoneNormalized,
                })
                .from(platformUsers)
                .where(
                  and(
                    eq(platformUsers.id, existingCommand.platformUserId),
                    isNull(platformUsers.mergedIntoId),
                  ),
                )
                .limit(1);
              const [enrollment] = await tx
                .select({ status: orgEnrollments.status })
                .from(orgEnrollments)
                .where(
                  and(
                    eq(orgEnrollments.organizationId, input.organizationId),
                    eq(orgEnrollments.platformUserId, existingCommand.platformUserId),
                    inArray(orgEnrollments.status, ['invited', 'active']),
                  ),
                )
                .limit(1);
              if (!patient || !enrollment) throw new Error('idempotency_replay_missing');
              return { ok: true, ...patient, created: false };
            }

            const [legacyAppointment] = await tx
              .select({ id: beAppointments.id })
              .from(beAppointments)
              .where(
                and(
                  eq(beAppointments.id, commandId),
                  eq(beAppointments.organizationId, input.organizationId),
                ),
              )
              .limit(1);
            const [legacyVisit] = await tx
              .select({ id: clinicalVisit.id })
              .from(clinicalVisit)
              .where(
                and(
                  eq(clinicalVisit.id, commandId),
                  eq(clinicalVisit.organizationId, input.organizationId),
                ),
              )
              .limit(1);
            if (legacyAppointment || legacyVisit) throw new Error('idempotency_conflict');
          }

          const identity = await resolveOrCreateDoctorClientByPhoneInTransaction(
            tx,
            input.organizationId,
            input,
          );
          await ensureInvitedOrganizationClientRelationship(
            tx,
            input.organizationId,
            identity.userId,
          );
          if (isStandaloneNoContact && commandId && requestFingerprint) {
            await insertManualPatientCommand(tx, {
              commandId,
              organizationId: input.organizationId,
              commandKind: 'standalone_no_contact_card',
              requestFingerprint,
              platformUserId: identity.userId,
            });
          }

          return {
            ok: true,
            ...identity,
          };
        });
      } catch (error) {
        if (error instanceof DoctorClientIdentityError) {
          return { ok: false, error: error.code };
        }
        if (error instanceof OrganizationClientRelationshipDeniedError) {
          return { ok: false, error: 'inactive_enrollment' };
        }
        if (error instanceof StockQuotaReachedError && error.mechanic === 'patient_count') {
          return { ok: false, error: 'patient_count_limit_reached' };
        }
        if (
          (error instanceof Error && error.message === 'idempotency_conflict') ||
          isManualPatientCommandUniqueViolation(error)
        ) {
          return { ok: false, error: 'idempotency_conflict' };
        }
        const pg = pgConstraint(error);
        if (pg.code === '23505' && pg.constraint === 'uq_platform_users_email_normalized_active') {
          return { ok: false, error: 'email_conflict' };
        }
        return { ok: false, error: 'create_failed' };
      }
    },
    async findTreatmentProgramOrganizationForPatient(platformUserId, instanceId) {
      void platformUserId;
      const result = await runWithWebappDbOperationFamily('patient_ui_config', () =>
        runWebappPgText<{ organization_id: string | null }>(
          'SELECT app.resolve_current_patient_treatment_program_organization($1::uuid) AS organization_id',
          [instanceId],
        ),
      );
      return result.rows[0]?.organization_id ?? null;
    },
  };
}
