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
 *
 * PRINCIPAL (2026-08-19). The write half runs under the PATIENT principal, not the organisation
 * one. At this point the visitor is no longer anonymous: they named themselves in order to be
 * booked, which is exactly what the patient principal describes, and the eleven patient booking
 * roots that already exist and are already audited then carry every statement
 * (`create_current_patient_booking_pending`, `create_current_patient_booking_appointments`,
 * `save_current_patient_booking_form_answers`, `reserve_current_patient_booking_package`,
 * `record_current_patient_booking_contact` and neighbours). Under the organisation principal two of
 * them could not work at all — `app.is_current_patient_self_booking_allowed()` and
 * `app.read_current_patient_booking_packages(uuid)` are patient roots invoked with no patient in
 * context — and a parallel public write seam would have been a second implementation of the same
 * rules.
 *
 * The relationship with the clinic is established first and inside this same operation, because the
 * appointment root refuses a person the clinic holds no `org_enrollments` row for. See
 * `enrollCurrentPatientInPublicBookingClinic` for the owner ruling that makes a first-time visitor
 * a client.
 */
import { getPool } from '@/app-layer/db/client';
import { logger } from '@/app-layer/logging/logger';
import {
  withPatientIdentityPrincipal,
  withPatientOrganizationPrincipal,
} from '@/app-layer/principal/withOrganizationPrincipal';
import {
  enrollCurrentPatientInPublicBookingClinic,
} from '@/infra/repos/pgPublicBookingUserResolve';
import { recordPublicBookingMergeCandidates } from '@/app-layer/platform-user/recordPublicBookingMergeCandidates';
import {
  InPersonBookingResolveError,
  resolveCurrentPatientInPersonBookingContext,
  type InPersonBookingResolveDeps,
} from '@/modules/patient-booking/inPersonBookingResolve';
import type {
  CreatePatientBookingInput,
  PatientBookingRecord,
} from '@/modules/patient-booking/types';
import type { PublicBookingIntent } from '@/modules/public-booking/publicBookingIntent';
import type { BookingAttribution } from '@/modules/booking-attribution/types';

type CreateVerifiedPublicBookingDeps = InPersonBookingResolveDeps & {
  patientBooking: {
    createBooking: (input: CreatePatientBookingInput) => Promise<PatientBookingRecord>;
  };
};

export async function createVerifiedPublicBooking(
  deps: CreateVerifiedPublicBookingDeps,
  intent: PublicBookingIntent,
  platformUserId: string,
): Promise<PatientBookingRecord> {
  // Identity-only principal: the visitor may not be a client of this clinic yet, and a principal
  // claiming an organisation the person has no enrolment row for is refused by the tenant-claim
  // gate. This step is what creates that row.
  await withPatientIdentityPrincipal(
    {
      platformUserId,
      source: 'api/booking/public/create/confirm:POST',
    },
    () => enrollCurrentPatientInPublicBookingClinic(intent.organizationId),
  );

  const result = await withPatientOrganizationPrincipal(
    {
      organizationId: intent.organizationId,
      platformUserId,
      source: 'api/booking/public/create/confirm:POST',
    },
    async () => {
      // The PATIENT resolver, the same one the cabinet booking route uses: it proves enrolment and
      // catalog scope inside its named DB root and hands back the city, so nothing here reads
      // `be_branches` relationally — a patient login has no SELECT on that table at all, and the
      // tenant-service resolver used to be reached under an organisation principal that this path
      // no longer has.
      const ctx = await resolveCurrentPatientInPersonBookingContext(deps, {
        branchId: intent.branchId,
        serviceId: intent.serviceId,
      });
      if (ctx.organizationId !== intent.organizationId) {
        throw new InPersonBookingResolveError('ambiguous_booking_tenant');
      }
      const cityCode = ctx.cityCode?.trim().toLowerCase();
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
    // Duplicate-person detection is a back-office queue for staff, and it still has no door of its
    // own: it reads `platform_users` relationally through `getPool()` with no principal at all, so
    // it fails with «Missing declared webapp port capability: pre_session» — it has been failing
    // since the port-context cutover on 12.08, exactly like the rest of this path.
    //
    // It is NOT silenced here and it is NOT allowed to destroy the visit: the appointment is
    // already committed by this point, and losing a merge candidate is a lost hint for staff,
    // while throwing would lose a booking the person has already been told about. Giving it a real
    // root is a separate question, because it writes a staff-review row ABOUT SOMEBODY ELSE on
    // behalf of an anonymous visitor — see the report for this branch.
    try {
      await recordPublicBookingMergeCandidates({
        pool: getPool(),
        organizationId: intent.organizationId,
        anchorUserId: result.userId,
        contactName: intent.contactName,
        triggerAppointmentId: result.booking.canonicalAppointmentId,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
          cause: error instanceof Error ? error.cause : undefined,
          organizationId: intent.organizationId,
          appointmentId: result.booking.canonicalAppointmentId,
        },
        '[booking/public] merge candidates for a public booking were not recorded',
      );
    }
  }

  return result.booking;
}
