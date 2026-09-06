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
  AcquiringWebhookSettlementOutcome,
  AddCashPaymentInput,
  InsertAcquiringPendingInput,
  PatientPayment,
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
 * Строка журнала, вернувшаяся из именованного корня: `to_jsonb` отдаёт КОЛОНКИ базы, а не
 * camelCase-отображение Drizzle, поэтому у неё свой разбор — общий с реляционным путём остаётся
 * доменный тип, а не форма строки.
 */
type PatientPaymentJsonRow = {
  id: string;
  organization_id: string | null;
  patient_user_id: string;
  amount_minor: number;
  currency: string | null;
  kind: string;
  status: string;
  comment: string | null;
  service: string | null;
  visit_id: string | null;
  appointment_id: string | null;
  patient_package_id: string | null;
  idempotency_key: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  created_by: string;
  created_at: string;
};

function jsonRowToPayment(row: PatientPaymentJsonRow): PatientPayment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientUserId: row.patient_user_id,
    amountMinor: row.amount_minor,
    currency: row.currency ?? 'RUB',
    kind: row.kind as PatientPayment['kind'],
    status: row.status as PatientPayment['status'],
    comment: row.comment,
    service: row.service,
    visitId: row.visit_id,
    appointmentId: row.appointment_id,
    patientPackageId: row.patient_package_id,
    idempotencyKey: row.idempotency_key,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
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
  assertPatientPaymentTenant(organizationId);
  return withTransaction((client) => fn(getWebappSqlFromPgClient(client) as DrizzleDb));
}

/**
 * Единственная формулировка правила арендатора для журнала платежей: у КАЖДОЙ пишущей двери, а не
 * у одного реляционного пути. Именованный корень наличных по записи не отменяет его: SQL-сверка
 * внутри корня (`require_accepted_context` + `app.current_org_id()`) закрывает стену, но снятый
 * здесь гейт молча меняет вопрос — дверь перестаёт утверждать, под каким принципалом пишутся
 * собранные врачом наличные, и `organizationId` из честного аргумента снова становится способом
 * назвать чужую клинику.
 */
function assertPatientPaymentTenant(organizationId: string): void {
  if (requiredPrincipalOrganizationId() !== organizationId) {
    throw new Error('patient_payment_organization_principal_mismatch');
  }
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
      /**
       * PAY-APPT-11/12: наличные ПО ЗАПИСИ гасят требование предоплаты в том же коммите, что и
       * строку журнала. Отдельным путём это быть не может: `prepayment_paid_minor` пишет только
       * платёжный шов, а именованный корень не стартует внутри реляционной транзакции — разложи
       * это на два коммита, и упавший второй оставит оплаченную запись под отменой по истечении
       * срока. Прочие наличные (визит, абонемент) идут прежним реляционным путём: записи у них
       * нет, гасить нечего.
       */
      if (input.appointmentId && idempotencyKey) {
        assertPatientPaymentTenant(input.organizationId);
        const payload = JSON.stringify({
          organizationId: input.organizationId,
          appointmentId: input.appointmentId,
          patientUserId: input.patientUserId,
          amountMinor: input.amountMinor,
          currency: input.currency ?? 'RUB',
          comment: input.comment ?? null,
          service: input.service ?? null,
          idempotencyKey,
          createdBy: input.createdBy,
        });
        const settled = await runWebappNamedRoot<{
          settlement: { payment: PatientPaymentJsonRow | null } | null;
        }>(
          getWebappSqlDb(),
          'app.settle_appointment_cash_prepayment(text)',
          [payload],
          sql`SELECT app.settle_appointment_cash_prepayment(
            ${payload}::text
          ) AS settlement`,
        );
        const payment = settled.rows[0]?.settlement?.payment ?? null;
        if (!payment?.id) throw new Error('appointment_cash_settlement_failed');
        return jsonRowToPayment(payment);
      }
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

    /**
     * The acquiring callback runs under the ORGANIZATION principal its route installed, i.e. the
     * port's `tenant_service` class — and that class has no through-relation capability at all
     * (`privileges/declaration.ts`: «сквозной `purpose: 'relation'` этому классу не выдают»). Every
     * plain `db.select()`/`db.update()` here therefore threw on the missing capability before any
     * SQL was issued, which is why a charged patient's row stayed `pending` and the acquirer retried
     * forever. `tenant_service` reaches data through NAMED ROOTS, so this is one.
     *
     * The root also takes no organization argument: it reads the accepted tenant from the installed
     * context, matches exactly one row, and moves it out of `pending` in a single compare-and-set.
     */
    async settleAcquiringWebhookPayment({ providerId, providerPaymentId, status }) {
      const result = await runWebappNamedRoot<{ outcome: AcquiringWebhookSettlementOutcome }>(
        getWebappSqlDb(),
        'app.settle_patient_acquiring_webhook_payment(text,text,text)',
        [providerId, providerPaymentId, status],
        sql`SELECT app.settle_patient_acquiring_webhook_payment(
          ${providerId}::text,
          ${providerPaymentId}::text,
          ${status}::text
        ) AS outcome`,
      );
      const outcome = result.rows[0]?.outcome;
      if (outcome !== 'settled' && outcome !== 'already_processed' && outcome !== 'not_found') {
        throw new Error('patient_acquiring_webhook_settlement_outcome_unrecognised');
      }
      return outcome;
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
