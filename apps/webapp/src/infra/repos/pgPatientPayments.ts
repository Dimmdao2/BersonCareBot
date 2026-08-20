/**
 * Pg implementation of PatientPaymentsPort.
 * Uses Drizzle ORM. listPayments returns newest-first.
 */

import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDrizzle, type DrizzleDb } from '@/app-layer/db/drizzle';
import {
  getCurrentDbPrincipalOrganizationId,
  runWithDbOrganizationPrincipal,
} from '@bersoncare/db-principal';
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
    idempotencyKey: row.idempotencyKey ?? null,
    provider: row.provider ?? null,
    providerPaymentId: row.providerPaymentId ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function runPatientPaymentMutation<T>(
  organizationId: string,
  fn: (db: DrizzleDb) => Promise<T>,
): Promise<T> {
  return runWithDbOrganizationPrincipal(organizationId, () =>
    withTransaction((client) => fn(getWebappSqlFromPgClient(client) as DrizzleDb)),
  );
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
            idempotencyKey,
            provider: null,
            providerPaymentId: null,
            createdBy: input.createdBy,
          })
          .onConflictDoNothing({
            target: [
              patientPayment.organizationId,
              patientPayment.appointmentId,
              patientPayment.idempotencyKey,
            ],
            where: isNotNull(patientPayment.idempotencyKey),
          })
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
