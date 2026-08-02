/**
 * A-3 — the ONLY way a public-widget booking reaches the database.
 *
 * Both callers have already passed `identifyPublicBookingPayer`. This operation accepts only its
 * canonical platform user id; contact fields remain booking data, never payment authorization.
 *
 * The tenant binding is re-verified here, not trusted from the pinned intent: the intent was
 * validated up to ten minutes earlier and a branch/service can be moved or deactivated in between.
 * This keeps the three-way agreement (slug → organisation, branch+service → organisation, resolved
 * context → organisation) that already defends the cross-organisation case.
 */
import { getPool } from '@/app-layer/db/client';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { recordPublicBookingMergeCandidates } from '@/app-layer/platform-user/recordPublicBookingMergeCandidates';
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
} from '@/modules/patient-booking/inPersonBookingResolve';
import type {
  CreatePatientBookingInput,
  PatientBookingRecord,
} from '@/modules/patient-booking/types';
import type { PublicBookingIntent } from '@/modules/public-booking/publicBookingIntent';
import type { BookingAttribution } from '@/modules/booking-attribution/types';

type CreateVerifiedPublicBookingDeps = Parameters<typeof resolveInPersonBookingContext>[0] & {
  patientBooking: {
    createBooking: (input: CreatePatientBookingInput) => Promise<PatientBookingRecord>;
  };
};

export async function createVerifiedPublicBooking(
  deps: CreateVerifiedPublicBookingDeps,
  intent: PublicBookingIntent,
  platformUserId: string,
): Promise<PatientBookingRecord> {
  const result = await withExplicitOrganizationPrincipal(
    {
      organizationId: intent.organizationId,
      source: 'api/booking/public/create/confirm:POST',
    },
    async () => {
      const ctx = await resolveInPersonBookingContext(deps, {
        branchId: intent.branchId,
        serviceId: intent.serviceId,
      });
      if (ctx.organizationId !== intent.organizationId) {
        throw new InPersonBookingResolveError('ambiguous_booking_tenant');
      }
      const branch = await deps.bookingEngine?.catalog.getBranch(ctx.branchId);
      const cityCode = branch?.cityCode.trim().toLowerCase();
      if (!cityCode) throw new InPersonBookingResolveError('branch_not_found');
      const booking = await deps.patientBooking.createBooking({
        userId: platformUserId,
        organizationId: ctx.organizationId,
        bookingChannel: 'public_widget' as const,
        attribution: intent.attribution as BookingAttribution | undefined,
        type: 'in_person' as const,
        branchId: ctx.branchId,
        serviceId: ctx.serviceId,
        cityCode,
        slotStart: intent.slotStart,
        slotEnd: intent.slotEnd,
        slotCount: intent.slotCount,
        contactName: intent.contactName,
        contactPhone: intent.contactPhone,
        contactEmail: intent.contactEmail,
        formAnswers: intent.formAnswers,
      });
      return { booking, userId: platformUserId };
    },
  );

  if (result.booking.canonicalAppointmentId && deps.bookingEngine) {
    await recordPublicBookingMergeCandidates({
      pool: getPool(),
      organizationId: intent.organizationId,
      anchorUserId: result.userId,
      contactName: intent.contactName,
      triggerAppointmentId: result.booking.canonicalAppointmentId,
    });
  }

  return result.booking;
}
