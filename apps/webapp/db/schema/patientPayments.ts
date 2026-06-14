import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";
import { clinicalVisit } from "./patientClinical";

/**
 * Ledger записей об оплате к карточке пациента (раздел «Учётка» кабинета врача).
 *
 * Сейчас реализована только наличная оплата (kind='cash', status='paid').
 * Эквайринг (kind='acquiring') хранится здесь же, но INSERT'ы через
 * него пойдут только после подключения провайдера (ЮКасса/ЮМани) через
 * AcquiringGatewayPort — сейчас это NoopAcquiringGateway, который вернёт
 * { ok:false, reason:'not_implemented' }.
 *
 * Суммы хранятся в **копейках** (целое число) — never float.
 */

export const PATIENT_PAYMENT_KINDS = ["cash", "acquiring"] as const;
export type PatientPaymentKind = (typeof PATIENT_PAYMENT_KINDS)[number];

export const PATIENT_PAYMENT_STATUSES = ["paid", "pending", "refunded", "failed"] as const;
export type PatientPaymentStatus = (typeof PATIENT_PAYMENT_STATUSES)[number];

export const patientPayment = pgTable(
  "patient_payment",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    /** Сумма в **копейках**; всегда > 0. */
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").default("RUB").notNull(),
    /** 'cash' — ручная запись наличных; 'acquiring' — карточная оплата через шлюз. */
    kind: text("kind").notNull(),
    status: text("status").default("paid").notNull(),
    comment: text("comment"),
    /** Название услуги (свободный текст, напр. «Первичный приём»). */
    service: text("service"),
    /** Связь с визитом (необязательна). */
    visitId: uuid("visit_id"),
    /** Идентификатор провайдера (заполняется при acquiring). */
    provider: text("provider"),
    /** Внешний ID платежа у провайдера (заполняется при acquiring). */
    providerPaymentId: text("provider_payment_id"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_patient_payment_patient_user_id").on(table.patientUserId),
    index("idx_patient_payment_created_at").on(table.createdAt),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_payment_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.visitId],
      foreignColumns: [clinicalVisit.id],
      name: "patient_payment_visit_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [platformUsers.id],
      name: "patient_payment_created_by_fkey",
    }).onDelete("restrict"),
    check(
      "patient_payment_amount_minor_positive",
      sql`amount_minor > 0`,
    ),
    check(
      "patient_payment_kind_check",
      sql`kind = ANY (ARRAY['cash'::text, 'acquiring'::text])`,
    ),
    check(
      "patient_payment_status_check",
      sql`status = ANY (ARRAY['paid'::text, 'pending'::text, 'refunded'::text, 'failed'::text])`,
    ),
  ],
);
