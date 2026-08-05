import type { BookingFormPort, BookingFormService } from './ports';
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
  function assertBookingWriteClearance(): void {
    dependencies.assertWriteClearance?.('booking');
  }

  return {
    async validateAnswers(organizationId, audience, answers, profilePrefill) {
      const fields = await port.listActiveFields(organizationId, audience);
      return validateBookingFormAnswers(fields, answers, profilePrefill);
    },

    async saveForAppointment(organizationId, appointmentId, answers) {
      await port.saveSubmissions({ organizationId, appointmentId, answers });
    },

    listPatientFields(organizationId) {
      return port.listActiveFields(organizationId, 'patient');
    },

    listAdminFields(organizationId) {
      return port.listAllFieldsAdmin(organizationId);
    },

    async upsertAdminField(organizationId, input) {
      assertBookingWriteClearance();
      return port.upsertFieldAdmin(organizationId, input);
    },
  };
}
