import type { BookingFormPort, BookingFormService } from './ports';
import {
  canonicalBookingFormFieldKey,
  isSystemFormField,
  SYSTEM_FORM_FIELDS,
  type FormSurface,
} from './fieldTypes';
import { validateBookingFormAnswers } from './validateAnswers';

type BookingFormServiceDependencies = {
  /**
   * 3.2: physically refuses a surface write unless its passing mutation decision already ran in
   * this request (injected from `buildAppDeps.ts` as `assertMechanicWriteClearance`).
   */
  assertWriteClearance?: (mechanic: 'booking' | 'leads') => void;
};

export function createBookingFormService(
  port: BookingFormPort,
  dependencies: BookingFormServiceDependencies = {},
): BookingFormService {
  function withSystemFields(
    organizationId: string,
    surface: FormSurface,
    fields: Awaited<ReturnType<BookingFormPort['listActiveFields']>>,
  ) {
    const normalizedFields = fields.map((field) => {
      const canonicalKey = canonicalBookingFormFieldKey(field.fieldKey);
      const definition = SYSTEM_FORM_FIELDS[surface].find(
        (candidate) => candidate.fieldKey === canonicalKey,
      );
      if (!definition) return field;
      const mandatoryLeadField =
        surface === 'leads' &&
        (definition.fieldKey === 'email' || definition.fieldKey === 'message');
      return {
        ...field,
        fieldType: definition.fieldType,
        ...(surface === 'booking' ? { label: definition.label } : {}),
        ...(mandatoryLeadField ? { isRequired: true, isActive: true } : {}),
      };
    });
    const configuredSystemKeys = new Set(
      normalizedFields.map((field) => canonicalBookingFormFieldKey(field.fieldKey)),
    );
    return [
      ...normalizedFields,
      ...SYSTEM_FORM_FIELDS[surface]
        .filter((definition) => !configuredSystemKeys.has(definition.fieldKey))
        .map((definition) => ({
          id: `system:${definition.fieldKey}`,
          organizationId,
          formSurface: surface,
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

  function assertSurfaceWriteClearance(surface: FormSurface): void {
    dependencies.assertWriteClearance?.(surface);
  }

  return {
    async validateAnswers(organizationId, _audience, answers, profilePrefill) {
      const fields = withSystemFields(
        organizationId,
        'booking',
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
        'booking',
        await port.listActiveFields(organizationId, 'patient'),
      );
      return fields.filter((field) => field.isActive);
    },

    async listPublicFields(organizationId, surface) {
      const fields = withSystemFields(
        organizationId,
        surface,
        await port.listActiveFields(organizationId, 'patient', surface),
      );
      return fields.filter((field) => field.isActive);
    },

    async listAdminFields(organizationId, surface = 'booking') {
      return withSystemFields(
        organizationId,
        surface,
        await port.listAllFieldsAdmin(organizationId, surface),
      );
    },

    async upsertAdminField(organizationId, input) {
      const surface = input.formSurface ?? 'booking';
      assertSurfaceWriteClearance(surface);
      const existing = input.id
        ? (await port.listAllFieldsAdmin(organizationId, surface)).find(
            (field) => field.id === input.id,
          )
        : null;
      const systemFieldKey = existing?.fieldKey ?? input.fieldKey;
      const definition = SYSTEM_FORM_FIELDS[surface].find(
        (candidate) => candidate.fieldKey === canonicalBookingFormFieldKey(systemFieldKey),
      );
      return port.upsertFieldAdmin(
        organizationId,
        definition
          ? {
              ...input,
              fieldKey: systemFieldKey,
              fieldType: definition.fieldType,
              ...(surface === 'booking' ? { label: definition.label } : {}),
              ...(surface === 'leads' &&
              (definition.fieldKey === 'email' || definition.fieldKey === 'message')
                ? { isRequired: true, isActive: true }
                : {}),
            }
          : input,
      );
    },

    async archiveAdminField(organizationId, fieldId, surface = 'booking') {
      assertSurfaceWriteClearance(surface);
      const field = (await port.listAllFieldsAdmin(organizationId, surface)).find(
        (candidate) => candidate.id === fieldId,
      );
      if (!field) throw new Error('booking_form_field_not_found');
      if (isSystemFormField(surface, field.fieldKey)) {
        throw new Error('booking_form_system_field_cannot_be_archived');
      }
      await port.archiveFieldAdmin(organizationId, fieldId, surface);
    },
  };
}
