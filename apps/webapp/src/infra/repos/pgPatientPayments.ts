/**
 * Pg implementation of PatientPaymentsPort.
 * Uses Drizzle ORM. listPayments returns newest-first.
 */

import { and, desc, eq, inArray, isNotNull, isNull, sum } from 'drizzle-orm';
import { getDrizzle, type DrizzleDb } from '@/app-layer/db/drizzle';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
} from '@/infra/db/runWebappSql';
import { withTransaction } from '@/infra/db/withClient';
import { sql } from 'drizzle-orm';
import type {
  AddCashPaymentInput,
  InsertAcquiringPendingInput,
  PatientPayment,
  PatientPaymentStatus,
  PatientPaymentsPort,
} from '@/modules/patient-payments/ports';
import { patientPayment } from '../../../db/schema/patientPayments';

function rowToPayment(row: typeof patientPayment.$inferSelect): PatientPayment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    patientUserId: row.patientUserId,
    amountMinor: row.amountMinor,
    currency: row.currency ?? 'RUB',
    kind: row.kind as PatientPayment['kind'],
    status: row.status as PatientPayment['status'],
    comment: row.comment ?? null,
    service: row.service ?? null,
    visitId: row.visitId ?? null,
    appointmentId: row.appointmentId ?? null,
    patientPackageId: row.patientPackageId ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    provider: row.provider ?? null,
    providerPaymentId: row.providerPaymentId ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/**
 * The ledger is plain relation access, and the webapp port hands the tenant-service class no
 * through-door for that: `deploy/postgres/privileges/declaration.ts` states «сквозной
 * `purpose: 'relation'` этому классу не выдают (SCHEME §3)», so the only declared relation
 * capabilities are `staff`, `patient` and `platform`. Re-entering an organization principal here
 * therefore made every write physically unreachable — the port-context resolver looked up a
 * `tenant_service` capability that does not exist and threw before any SQL was issued. The
 * declared writer of `public.patient_payment` is `app_staff` (`privileges/relation-access.ts`),
 * which is exactly the principal every cabinet cash/acquiring door already installs.
 *
 * So the write runs under the principal its caller installed, and `organizationId` stays an
 * honest argument by being checked against it instead of silently redefining the tenant.
 */
function runPatientPaymentMutation<T>(
  organizationId: string,
  fn: (db: DrizzleDb) => Promise<T>,
): Promise<T> {
  if (requiredPrincipalOrganizationId() !== organizationId) {
    throw new Error('patient_payment_organization_principal_mismatch');
  }
  return withTransaction((client) => fn(getWebappSqlFromPgClient(client) as DrizzleDb));
}

function requiredPrincipalOrganizationId(): string {
  const organizationId = getCurrentDbPrincipalOrganizationId();
  if (!organizationId) {
    throw new Error('organization_principal_required');
  }
  return organizationId;
}

export function createPgPatientPaymentsPort(): PatientPaymentsPort {
  return {
    async listPayments(patientUserId: string): Promise<PatientPayment[]> {
      const organizationId = requiredPrincipalOrganizationId();
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientPayment)
        .where(
          and(
            eq(patientPayment.patientUserId, patientUserId),
            eq(patientPayment.organizationId, organizationId),
          ),
        )
        .orderBy(desc(patientPayment.createdAt));
      return rows.map(rowToPayment);
    },

    async listAppointmentPayments(appointmentId, patientUserId): Promise<PatientPayment[]> {
      const organizationId = requiredPrincipalOrganizationId();
      const rows = await getDrizzle()
        .select()
        .from(patientPayment)
        .where(
          and(
            eq(patientPayment.appointmentId, appointmentId),
            eq(patientPayment.patientUserId, patientUserId),
            eq(patientPayment.organizationId, organizationId),
          ),
        )
        .orderBy(desc(patientPayment.createdAt));
      return rows.map(rowToPayment);
    },

    async sumPaidMinorForAppointments(appointmentIds) {
      if (appointmentIds.length === 0) return [];
      const organizationId = requiredPrincipalOrganizationId();
      const rows = await getDrizzle()
        .select({
          appointmentId: patientPayment.appointmentId,
          paidMinor: sum(patientPayment.amountMinor),
        })
        .from(patientPayment)
        .where(
          and(
            inArray(patientPayment.appointmentId, appointmentIds),
            eq(patientPayment.organizationId, organizationId),
            eq(patientPayment.status, 'paid'),
          ),
        )
        .groupBy(patientPayment.appointmentId);
      return rows.map((row) => ({
        appointmentId: row.appointmentId as string,
        paidMinor: Number(row.paidMinor ?? 0),
      }));
    },

    async addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment> {
      const idempotencyKey = input.idempotencyKey?.trim() || null;
      const row = await runPatientPaymentMutation(input.organizationId, async (tx) => {
        const inserted = await tx
          .insert(patientPayment)
          .values({
            organizationId: input.organizationId,
            patientUserId: input.patientUserId,
            amountMinor: input.amountMinor,
            currency: input.currency ?? 'RUB',
            kind: 'cash',
            status: 'paid',
            comment: input.comment ?? null,
            service: input.service ?? null,
            visitId: input.visitId ?? null,
            appointmentId: input.appointmentId ?? null,
            patientPackageId: input.patientPackageId ?? null,
            idempotencyKey,
            provider: null,
            providerPaymentId: null,
            createdBy: input.createdBy,
          })
          // Two partial unique indexes carry this door now — one keyed by appointment, one by
          // patient package — and a single ON CONFLICT target can name only one of them. The
          // untargeted form covers both; `id` is server-generated, so no other conflict is
          // reachable here, and the reread below resolves whichever boundary fired.
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) return inserted[0];
        if (!idempotencyKey) throw new Error('patient_payment_insert_failed');
        const existing = await tx
          .select()
          .from(patientPayment)
          .where(
            and(
              eq(patientPayment.organizationId, input.organizationId),
              input.appointmentId
                ? eq(patientPayment.appointmentId, input.appointmentId)
                : isNull(patientPayment.appointmentId),
              input.patientPackageId
                ? eq(patientPayment.patientPackageId, input.patientPackageId)
                : isNull(patientPayment.patientPackageId),
              eq(patientPayment.idempotencyKey, idempotencyKey),
            ),
          );
        if (existing.length !== 1) throw new Error('cash_payment_idempotency_lookup_failed');
        return existing[0];
      });
      return rowToPayment(row);
    },

    async findByProviderPaymentReference(
      providerId: string,
      providerPaymentId: string,
    ): Promise<PatientPayment | null> {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientPayment)
        .where(
          and(
            eq(patientPayment.kind, 'acquiring'),
            eq(patientPayment.provider, providerId),
            eq(patientPayment.providerPaymentId, providerPaymentId),
          ),
        );
      return rows.length === 1 ? rowToPayment(rows[0]) : null;
    },

    async resolveAcquiringWebhookOrganization(providerId, providerPaymentId) {
      const result = await runWebappNamedRoot<{ organization_id: string | null }>(
        getWebappSqlDb(),
        'app.resolve_patient_acquiring_webhook_organization(text,text)',
        [providerId, providerPaymentId],
        sql`SELECT app.resolve_patient_acquiring_webhook_organization(
          ${providerId}::text,
          ${providerPaymentId}::text
        )::text AS organization_id`,
      );
      return result.rows[0]?.organization_id ?? null;
    },

    async updatePatientPaymentStatus(
      id: string,
      status: PatientPaymentStatus,
      organizationId: string,
      providerPaymentId?: string,
    ): Promise<void> {
      await runPatientPaymentMutation(organizationId, (tx) =>
        tx
          .update(patientPayment)
          .set({
            status,
            ...(providerPaymentId !== undefined ? { providerPaymentId } : {}),
          })
          .where(and(eq(patientPayment.id, id), eq(patientPayment.organizationId, organizationId))),
      );
    },

    async insertAcquiringPending(input: InsertAcquiringPendingInput): Promise<PatientPayment> {
      const [row] = await runPatientPaymentMutation(input.organizationId, (tx) =>
        tx
          .insert(patientPayment)
          .values({
            organizationId: input.organizationId,
            patientUserId: input.patientUserId,
            amountMinor: input.amountMinor,
            currency: input.currency,
            kind: 'acquiring',
            status: 'pending',
            comment: input.description ?? null,
            service: null,
            visitId: null,
            appointmentId: input.appointmentId ?? null,
            idempotencyKey: null,
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
            createdBy: input.createdBy,
          })
          .returning(),
      );
      return rowToPayment(row);
    },
  };
}
