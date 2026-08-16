import { and, asc, eq, sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import {
  beBookingFormFields,
  beBookingFormSubmissions,
} from '../../../db/schema/bookingScheduling';
import type { BookingFormFieldRecord, BookingFormPort } from '@/modules/booking-form/ports';

type BookingFormFieldRow = Pick<
  typeof beBookingFormFields.$inferSelect,
  | 'id'
  | 'organizationId'
  | 'fieldKey'
  | 'fieldType'
  | 'label'
  | 'placeholder'
  | 'isRequired'
  | 'visibleToPatient'
  | 'visibleToStaff'
  | 'sortOrder'
  | 'isActive'
>;

function mapField(row: BookingFormFieldRow): BookingFormFieldRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fieldKey: row.fieldKey,
    fieldType: row.fieldType,
    label: row.label,
    placeholder: row.placeholder ?? null,
    isRequired: row.isRequired,
    visibleToPatient: row.visibleToPatient,
    visibleToStaff: row.visibleToStaff,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export function createPgBookingFormPort(): BookingFormPort {
  return {
    async listActiveFields(organizationId, audience) {
      if (getCurrentDbPrincipal()?.kind === 'patient' && audience === 'patient') {
        const result = await runWebappNamedRoot<BookingFormFieldRow>(
          getWebappSqlDb(),
          'app.read_current_patient_booking_form_fields()',
          [],
          sql`SELECT
                id,
                organization_id AS "organizationId",
                field_key AS "fieldKey",
                field_type AS "fieldType",
                label,
                placeholder,
                is_required AS "isRequired",
                visible_to_patient AS "visibleToPatient",
                visible_to_staff AS "visibleToStaff",
                sort_order AS "sortOrder",
                is_active AS "isActive"
              FROM app.read_current_patient_booking_form_fields()`,
        );
        if (result.rows.some((row) => row.organizationId !== organizationId)) {
          throw new Error('ambiguous_booking_tenant');
        }
        return result.rows.map(mapField);
      }
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beBookingFormFields)
        .where(
          and(
            eq(beBookingFormFields.organizationId, organizationId),
            eq(beBookingFormFields.isActive, true),
            audience === 'patient'
              ? eq(beBookingFormFields.visibleToPatient, true)
              : eq(beBookingFormFields.visibleToStaff, true),
          ),
        )
        .orderBy(asc(beBookingFormFields.sortOrder), asc(beBookingFormFields.label));
      return rows.map(mapField);
    },

    async listAllFieldsAdmin(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beBookingFormFields)
        .where(eq(beBookingFormFields.organizationId, organizationId))
        .orderBy(asc(beBookingFormFields.sortOrder), asc(beBookingFormFields.label));
      return rows.map(mapField);
    },

    async upsertFieldAdmin(organizationId, input) {
      const db = getDrizzle();
      const now = new Date().toISOString();
      if (input.id) {
        const fieldId = input.id;
        const updated = await db.transaction((tx) =>
          tx
            .update(beBookingFormFields)
            .set({
              fieldKey: input.fieldKey,
              fieldType: input.fieldType,
              label: input.label,
              placeholder: input.placeholder ?? null,
              isRequired: input.isRequired,
              visibleToPatient: input.visibleToPatient,
              visibleToStaff: input.visibleToStaff,
              sortOrder: input.sortOrder,
              isActive: input.isActive,
              updatedAt: now,
            })
            .where(
              and(
                eq(beBookingFormFields.id, fieldId),
                eq(beBookingFormFields.organizationId, organizationId),
              ),
            )
            .returning(),
        );
        return mapField(updated[0]!);
      }
      const inserted = await db.transaction((tx) =>
        tx
          .insert(beBookingFormFields)
          .values({
            organizationId,
            fieldKey: input.fieldKey,
            fieldType: input.fieldType,
            label: input.label,
            placeholder: input.placeholder ?? null,
            isRequired: input.isRequired,
            visibleToPatient: input.visibleToPatient,
            visibleToStaff: input.visibleToStaff,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
            createdAt: now,
            updatedAt: now,
          })
          .returning(),
      );
      return mapField(inserted[0]!);
    },

    async saveSubmissions({ organizationId, appointmentId, answers }) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await runWebappNamedRoot(
          getWebappSqlDb(),
          'app.save_current_patient_booking_form_answers(uuid,text)',
          [
            appointmentId,
            JSON.stringify(
              answers.map((answer) => ({ field_key: answer.fieldKey, value_text: answer.value })),
            ),
          ],
          sql`SELECT app.save_current_patient_booking_form_answers(
            ${appointmentId}::uuid,
            ${JSON.stringify(
              answers.map((answer) => ({ field_key: answer.fieldKey, value_text: answer.value })),
            )}::text
          )`,
        );
        return;
      }
      const db = getDrizzle();
      const fields = await db
        .select()
        .from(beBookingFormFields)
        .where(eq(beBookingFormFields.organizationId, organizationId));
      const byKey = new Map(fields.map((f) => [f.fieldKey, f]));
      for (const answer of answers) {
        const field = byKey.get(answer.fieldKey);
        if (!field) continue;
        await db
          .insert(beBookingFormSubmissions)
          .values({
            organizationId,
            appointmentId,
            fieldId: field.id,
            valueText: answer.value,
          })
          .onConflictDoUpdate({
            target: [beBookingFormSubmissions.appointmentId, beBookingFormSubmissions.fieldId],
            set: { valueText: answer.value },
          });
      }
    },
  };
}
