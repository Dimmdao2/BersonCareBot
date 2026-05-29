import type { BookingFormPort, BookingFormService } from "./ports";
import { validateBookingFormAnswers } from "./validateAnswers";

export function createBookingFormService(port: BookingFormPort): BookingFormService {
  return {
    async validateAnswers(organizationId, audience, answers, profilePrefill) {
      const fields = await port.listActiveFields(organizationId, audience);
      return validateBookingFormAnswers(fields, answers, profilePrefill);
    },

    async saveForAppointment(organizationId, appointmentId, answers) {
      await port.saveSubmissions({ organizationId, appointmentId, answers });
    },

    listPatientFields(organizationId) {
      return port.listActiveFields(organizationId, "patient");
    },

    listAdminFields(organizationId) {
      return port.listAllFieldsAdmin(organizationId);
    },

    upsertAdminField(organizationId, input) {
      return port.upsertFieldAdmin(organizationId, input);
    },
  };
}
