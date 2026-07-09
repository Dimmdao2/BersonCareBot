/**
 * Pg implementation of PatientPaymentsPort.
 * Uses Drizzle ORM. listPayments returns newest-first.
 */

import { desc, eq } from "drizzle-orm";
import { getDrizzle, type DrizzleDb } from "@/app-layer/db/drizzle";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import { runWebappTransaction, type WebappSqlTransactionExecutor } from "@/infra/db/runWebappSql";
import type {
  AddCashPaymentInput,
  InsertAcquiringPendingInput,
  PatientPayment,
  PatientPaymentStatus,
  PatientPaymentsPort,
} from "@/modules/patient-payments/ports";
import { patientPayment } from "../../../db/schema/patientPayments";

function rowToPayment(row: typeof patientPayment.$inferSelect): PatientPayment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    patientUserId: row.patientUserId,
    amountMinor: row.amountMinor,
    currency: row.currency ?? "RUB",
    kind: row.kind as PatientPayment["kind"],
    status: row.status as PatientPayment["status"],
    comment: row.comment ?? null,
    service: row.service ?? null,
    visitId: row.visitId ?? null,
    provider: row.provider ?? null,
    providerPaymentId: row.providerPaymentId ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function runPatientPaymentMutation<T>(
  organizationId: string,
  fn: (db: DrizzleDb | WebappSqlTransactionExecutor) => Promise<T>,
): Promise<T> {
  return runWithDbOrganizationPrincipal(organizationId, () => runWebappTransaction(fn));
}

export function createPgPatientPaymentsPort(): PatientPaymentsPort {
  return {
    async listPayments(patientUserId: string): Promise<PatientPayment[]> {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientPayment)
        .where(eq(patientPayment.patientUserId, patientUserId))
        .orderBy(desc(patientPayment.createdAt));
      return rows.map(rowToPayment);
    },

    async addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment> {
      const [row] = await runPatientPaymentMutation(input.organizationId, (tx) =>
        tx
        .insert(patientPayment)
        .values({
          organizationId: input.organizationId,
          patientUserId: input.patientUserId,
          amountMinor: input.amountMinor,
          currency: input.currency ?? "RUB",
          kind: "cash",
          status: "paid",
          comment: input.comment ?? null,
          service: input.service ?? null,
          visitId: input.visitId ?? null,
          provider: null,
          providerPaymentId: null,
          createdBy: input.createdBy,
        })
          .returning(),
      );
      return rowToPayment(row);
    },

    async findByProviderPaymentId(providerPaymentId: string): Promise<PatientPayment | null> {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(patientPayment)
        .where(eq(patientPayment.providerPaymentId, providerPaymentId))
        .limit(1);
      return rows.length > 0 ? rowToPayment(rows[0]) : null;
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
          .where(eq(patientPayment.id, id)),
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
          kind: "acquiring",
          status: "pending",
          comment: input.description ?? null,
          service: null,
          visitId: null,
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
