import type { ClientHistoryPort } from './ports';
import type { UpsertPatientBookingProfileInput } from './types';

export function createClientHistoryService(port: ClientHistoryPort) {
  return {
    listTimeline(organizationId: string, platformUserId: string, limit?: number) {
      return port.listTimeline(organizationId, platformUserId, limit);
    },

    listPaymentHistory(organizationId: string, platformUserId: string, limit?: number) {
      return port.listPaymentHistory(organizationId, platformUserId, limit);
    },

    listVisitHistory(organizationId: string, platformUserId: string, limit?: number) {
      return port.listVisitHistory(organizationId, platformUserId, limit);
    },

    listPatientTimeline(organizationId: string, platformUserId: string, limit?: number) {
      return port.listPatientTimeline(organizationId, platformUserId, limit);
    },

    listPatientPaymentHistory(organizationId: string, platformUserId: string, limit?: number) {
      return port.listPatientPaymentHistory(organizationId, platformUserId, limit);
    },

    listPatientVisitHistory(organizationId: string, platformUserId: string, limit?: number) {
      return port.listPatientVisitHistory(organizationId, platformUserId, limit);
    },

    getBookingProfile(organizationId: string, platformUserId: string) {
      return port.getBookingProfile(organizationId, platformUserId);
    },

    upsertBookingProfile(input: UpsertPatientBookingProfileInput) {
      const note = input.problematicNote?.trim();
      return port.upsertBookingProfile({
        ...input,
        problematicNote: note ? note : null,
      });
    },

    assertSelfServiceBookingAllowed() {
      return port.isCurrentPatientSelfBookingAllowed().then((allowed) => {
        if (!allowed) throw new Error('booking_blocked');
      });
    },

    listAppointmentComments(organizationId: string, appointmentId: string) {
      return port.listAppointmentComments(organizationId, appointmentId);
    },

    createAppointmentComment(input: Parameters<ClientHistoryPort['createAppointmentComment']>[0]) {
      const body = input.body.trim();
      if (!body) throw new Error('empty_comment');
      return port.createAppointmentComment({ ...input, body });
    },
  };
}

export type ClientHistoryService = ReturnType<typeof createClientHistoryService>;
