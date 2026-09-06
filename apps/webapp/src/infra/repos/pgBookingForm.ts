import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { isCurrentPublicBookingPrincipal } from '@/app-layer/principal/publicBookingPrincipal';
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
  | 'archivedAt'
>;

const publicBookingFormFieldsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    fieldKey: z.string(),
    fieldType: z.string(),
    label: z.string(),
    placeholder: z.string().nullable(),
    isRequired: z.boolean(),
    visibleToPatient: z.boolean(),
    visibleToStaff: z.boolean(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    archivedAt: z.string().nullable(),
  }),
);

/**
 * Дверь полей формы для анонимного посетителя. `NULL` — неопубликованная клиника: снаружи её нет,
 * и форма для неё пуста, а не «как обычно». Пустой список от опубликованной клиники — законный.
 */
async function readPublicBookingFormFields(organizationId: string) {
  const result = await runWebappNamedRoot<{ fields: unknown }>(
    getWebappSqlDb(),
    'app.list_public_booking_form_fields()',
    [],
    sql`SELECT app.list_public_booking_form_fields() AS fields`,
  );
  const payload = result.rows[0]?.fields;
  if (payload == null) return [];
  const fields = publicBookingFormFieldsSchema.parse(payload);
  if (fields.some((field) => field.organizationId !== organizationId)) {
    throw new Error('ambiguous_booking_tenant');
  }
  return fields;
}

function mapField(row: BookingFormFieldRow): BookingFormFieldRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fieldKey: row.fieldKey,
    fieldType: row.fieldType,
    label: row.label,
    placeholder: row.placeholder ?? null,
    isRequired: row.isRequired,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    archivedAt: row.archivedAt,
  };
}

export function createPgBookingFormPort(): BookingFormPort {
  async function listActiveFields(
    organizationId: string,
    _audience: 'patient' | 'staff',
  ): Promise<BookingFormFieldRecord[]> {
    if (isCurrentPublicBookingPrincipal()) {
      return (await readPublicBookingFormFields(organizationId)).map(mapField);
    }
    if (getCurrentDbPrincipal()?.kind === 'patient') {
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
                is_active AS "isActive",
                NULL::timestamptz AS "archivedAt"
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
          isNull(beBookingFormFields.archivedAt),
        ),
      )
      .orderBy(asc(beBookingFormFields.sortOrder), asc(beBookingFormFields.label));
    return rows.map(mapField);
  }

  return {
    listActiveFields,

    async listAllFieldsAdmin(organizationId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beBookingFormFields)
        .where(
          and(
            eq(beBookingFormFields.organizationId, organizationId),
            isNull(beBookingFormFields.archivedAt),
          ),
        )
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
              visibleToPatient: input.isActive,
              visibleToStaff: input.isActive,
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
        if (!updated[0]) throw new Error('booking_form_field_not_found');
        return mapField(updated[0]);
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
            visibleToPatient: input.isActive,
            visibleToStaff: input.isActive,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [beBookingFormFields.organizationId, beBookingFormFields.fieldKey],
            set: {
              fieldType: input.fieldType,
              label: input.label,
              placeholder: input.placeholder ?? null,
              isRequired: input.isRequired,
              visibleToPatient: input.isActive,
              visibleToStaff: input.isActive,
              sortOrder: input.sortOrder,
              isActive: input.isActive,
              archivedAt: null,
              updatedAt: now,
            },
          })
          .returning(),
      );
      if (!inserted[0]) throw new Error('booking_form_field_write_failed');
      return mapField(inserted[0]);
    },

    async archiveFieldAdmin(organizationId, fieldId) {
      const db = getDrizzle();
      const archived = await db
        .update(beBookingFormFields)
        .set({
          archivedAt: new Date().toISOString(),
          isActive: false,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(beBookingFormFields.id, fieldId),
            eq(beBookingFormFields.organizationId, organizationId),
            isNull(beBookingFormFields.archivedAt),
          ),
        )
        .returning({ id: beBookingFormFields.id });
      if (!archived[0]) throw new Error('booking_form_field_not_found');
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
