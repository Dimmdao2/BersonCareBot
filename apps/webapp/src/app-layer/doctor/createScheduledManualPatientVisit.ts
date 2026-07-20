import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";
import { fireAndForgetContactEmailSetup } from "@/modules/auth/emailSetupAccess/enqueueContactEmailSetup";
import { normalizeEmail } from "@/modules/auth/emailAuth";
import type { createBookingEngineService } from "@/modules/booking-engine/service";
import type { CreateAppointmentInput } from "@/modules/booking-engine/types";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

type BookingEngineManualPatientVisitService = Pick<
  ReturnType<typeof createBookingEngineService>,
  "createManualPatientVisit"
>;

export type CreateScheduledManualPatientVisitInput = {
  organizationId: string;
  createdByUserId: string;
  displayName?: string | null;
  phone: string;
  email?: string | null;
  appointment: Omit<
    CreateAppointmentInput,
    "organizationId" | "platformUserId" | "phoneNormalized"
  >;
};

export async function createScheduledManualPatientVisit(
  input: CreateScheduledManualPatientVisitInput,
  deps: {
    bookingEngine: BookingEngineManualPatientVisitService;
    emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">;
  },
) {
  const phoneNormalized = normalizeRuPhoneE164(input.phone);
  if (!/^\+7\d{10}$/.test(phoneNormalized)) {
    return { ok: false as const, error: "invalid_phone" as const };
  }

  const emailRaw = input.email?.trim() || null;
  const emailNormalized = emailRaw ? normalizeEmail(emailRaw) : null;
  if (
    emailNormalized &&
    (emailNormalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized))
  ) {
    return { ok: false as const, error: "invalid_email" as const };
  }

  const displayName = input.displayName?.trim().slice(0, 500) || phoneNormalized;
  const result = await deps.bookingEngine.createManualPatientVisit({
    organizationId: input.organizationId,
    displayName,
    phoneNormalized,
    emailRaw,
    emailNormalized,
    appointment: input.appointment,
  });

  if (result.patient.created) {
    trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.DoctorStaffClientCreate);
  }
  if (emailNormalized) {
    fireAndForgetContactEmailSetup(
      deps.emailSetupAccess,
      {
        userId: result.patient.userId,
        emailNormalized,
        source: "doctor_profile",
        createdByUserId: input.createdByUserId,
      },
      { hook: "doctor.booking-engine.appointments.manual-patient-visit" },
    );
  }

  return { ok: true as const, ...result };
}
