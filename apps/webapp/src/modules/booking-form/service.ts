import type { BookingFormPort, BookingFormService } from './ports';
import {
  canonicalBookingFormFieldKey,
  isSystemBookingFormField,
  SYSTEM_BOOKING_FORM_FIELDS,
} from './fieldTypes';
import { validateBookingFormAnswers } from './validateAnswers';

type BookingFormServiceDependencies = {
  /**
   * 3.2: physically refuses a `booking` write unless a passing mutation decision already ran in
   * this request (injected from `buildAppDeps.ts` as `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'booking') => void;
};

export function createBookingFormService(
  port: BookingFormPort,
  dependencies: BookingFormServiceDependencies = {},
): BookingFormService {
  function withSystemFields(
    organizationId: string,
    fields: Awaited<ReturnType<BookingFormPort['listActiveFields']>>,
  ) {
    const normalizedFields = fields.map((field) => {
      const canonicalKey = canonicalBookingFormFieldKey(field.fieldKey);
      const definition = SYSTEM_BOOKING_FORM_FIELDS.find(
        (candidate) => candidate.fieldKey === canonicalKey,
      );
      return definition
        ? { ...field, fieldType: definition.fieldType, label: definition.label }
        : field;
    });
    const configuredSystemKeys = new Set(
      normalizedFields.map((field) => canonicalBookingFormFieldKey(field.fieldKey)),
    );
    return [
      ...normalizedFields,
      ...SYSTEM_BOOKING_FORM_FIELDS.filter(
        (definition) => !configuredSystemKeys.has(definition.fieldKey),
      ).map((definition) => ({
        id: `system:${definition.fieldKey}`,
        organizationId,
        fieldKey: definition.fieldKey,
        fieldType: definition.fieldType,
        label: definition.label,
        placeholder: null,
        isRequired: definition.isRequired,
        sortOrder: definition.sortOrder,
        isActive: true,
        archivedAt: null,
      })),
    ].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'ru'),
    );
  }

  function assertBookingWriteClearance(): void {
    dependencies.assertWriteClearance?.('booking');
  }

  return {
    async validateAnswers(organizationId, _audience, answers, profilePrefill) {
      const fields = withSystemFields(
        organizationId,
        await port.listActiveFields(organizationId, _audience),
      );
      return validateBookingFormAnswers(
        fields.filter((field) => field.isActive),
        answers,
        profilePrefill,
      );
    },

    async saveForAppointment(organizationId, appointmentId, answers) {
      await port.saveSubmissions({ organizationId, appointmentId, answers });
    },

    async listPatientFields(organizationId) {
      const fields = withSystemFields(
        organizationId,
        await port.listActiveFields(organizationId, 'patient'),
      );
      return fields.filter((field) => field.isActive);
    },

    async listAdminFields(organizationId) {
      return withSystemFields(organizationId, await port.listAllFieldsAdmin(organizationId));
    },

    async upsertAdminField(organizationId, input) {
      assertBookingWriteClearance();
      const existing = input.id
        ? (await port.listAllFieldsAdmin(organizationId)).find((field) => field.id === input.id)
        : null;
      const systemFieldKey = existing?.fieldKey ?? input.fieldKey;
      const definition = SYSTEM_BOOKING_FORM_FIELDS.find(
        (candidate) =>
          candidate.fieldKey === canonicalBookingFormFieldKey(systemFieldKey),
      );
      return port.upsertFieldAdmin(
        organizationId,
        definition
          ? {
              ...input,
              fieldKey: systemFieldKey,
              fieldType: definition.fieldType,
              label: definition.label,
            }
          : input,
      );
    },

    async archiveAdminField(organizationId, fieldId) {
      assertBookingWriteClearance();
      const field = (await port.listAllFieldsAdmin(organizationId)).find(
        (candidate) => candidate.id === fieldId,
      );
      if (!field) throw new Error('booking_form_field_not_found');
      if (isSystemBookingFormField(field.fieldKey)) {
        throw new Error('booking_form_system_field_cannot_be_archived');
      }
      await port.archiveFieldAdmin(organizationId, fieldId);
    },
  };
}
