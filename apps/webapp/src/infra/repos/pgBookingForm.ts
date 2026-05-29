import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { beBookingFormFields, beBookingFormSubmissions } from "../../../db/schema/bookingScheduling";
import type { BookingFormFieldRecord, BookingFormPort } from "@/modules/booking-form/ports";

function mapField(row: typeof beBookingFormFields.$inferSelect): BookingFormFieldRecord {
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
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(beBookingFormFields)
        .where(
          and(
            eq(beBookingFormFields.organizationId, organizationId),
            eq(beBookingFormFields.isActive, true),
            audience === "patient"
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
        const updated = await db
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
          .where(and(eq(beBookingFormFields.id, input.id), eq(beBookingFormFields.organizationId, organizationId)))
          .returning();
        return mapField(updated[0]!);
      }
      const inserted = await db
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
        .returning();
      return mapField(inserted[0]!);
    },

    async saveSubmissions({ organizationId, appointmentId, answers }) {
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
