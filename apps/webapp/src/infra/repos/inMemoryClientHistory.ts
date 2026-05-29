import type { ClientHistoryPort } from "@/modules/client-history/ports";

const emptyProfile = {
  platformUserId: "",
  organizationId: "",
  isProblematic: false,
  bookingBlocked: false,
  problematicNote: null,
  updatedAt: null,
  updatedBy: null,
};

export const inMemoryClientHistoryPort: ClientHistoryPort = {
  listTimeline: async () => [],
  listPaymentHistory: async () => [],
  listVisitHistory: async () => [],
  getBookingProfile: async () => null,
  upsertBookingProfile: async (input) => ({
    ...emptyProfile,
    platformUserId: input.platformUserId,
    organizationId: input.organizationId,
    isProblematic: input.isProblematic ?? false,
    bookingBlocked: input.bookingBlocked ?? false,
    problematicNote: input.problematicNote ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  }),
  isBookingBlocked: async () => false,
  listAppointmentComments: async () => [],
  createAppointmentComment: async (input) => ({
    id: "comment-1",
    appointmentId: input.appointmentId,
    platformUserId: input.platformUserId,
    authorId: input.authorId,
    body: input.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
};
