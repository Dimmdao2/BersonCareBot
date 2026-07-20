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
import { normalizeFioPart } from "@/shared/lib/fio";

type BookingEngineManualPatientVisitService = Pick<
  ReturnType<typeof createBookingEngineService>,
  "createManualPatientVisit"
>;

type ManualPatientIdentityInput = {
  organizationId: string;
  createdByUserId: string;
  lastName: string;
  firstName: string;
  patronymic?: string | null;
  phone: string;
  email?: string | null;
};

export type CreateScheduledManualPatientVisitInput = ManualPatientIdentityInput & {
  appointment: Omit<
    CreateAppointmentInput,
    "organizationId" | "platformUserId" | "phoneNormalized"
  >;
};

export type CreateWalkInManualPatientVisitInput = ManualPatientIdentityInput & {
  specialistId: string;
  visitedAt: string;
};

function normalizeManualPatientIdentity(input: ManualPatientIdentityInput) {
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

  const lastName = normalizeFioPart(input.lastName);
  const firstName = normalizeFioPart(input.firstName);
  const patronymic = normalizeFioPart(input.patronymic);
  if (!lastName || !firstName) {
    return { ok: false as const, error: "invalid_fio" as const };
  }
  return {
    ok: true as const,
    identity: { lastName, firstName, patronymic, phoneNormalized, emailRaw, emailNormalized },
  };
}

function enqueueManualPatientContactSetup(
  input: ManualPatientIdentityInput,
  result: Awaited<ReturnType<BookingEngineManualPatientVisitService["createManualPatientVisit"]>>,
  emailNormalized: string | null,
  deps: { emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup"> },
) {
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
}

export async function createScheduledManualPatientVisit(
  input: CreateScheduledManualPatientVisitInput,
  deps: {
    bookingEngine: BookingEngineManualPatientVisitService;
    emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">;
  },
) {
  const normalized = normalizeManualPatientIdentity(input);
  if (!normalized.ok) return normalized;
  const result = await deps.bookingEngine.createManualPatientVisit({
    organizationId: input.organizationId,
    ...normalized.identity,
    kind: "scheduled",
    appointment: input.appointment,
  });
  enqueueManualPatientContactSetup(input, result, normalized.identity.emailNormalized, deps);

  return { ok: true as const, ...result };
}

export async function createWalkInManualPatientVisit(
  input: CreateWalkInManualPatientVisitInput,
  deps: {
    bookingEngine: BookingEngineManualPatientVisitService;
    emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">;
  },
) {
  const normalized = normalizeManualPatientIdentity(input);
  if (!normalized.ok) return normalized;
  const result = await deps.bookingEngine.createManualPatientVisit({
    organizationId: input.organizationId,
    ...normalized.identity,
    kind: "walk_in",
    walkIn: {
      specialistId: input.specialistId,
      visitedAt: input.visitedAt,
      actorId: input.createdByUserId,
    },
  });
  enqueueManualPatientContactSetup(input, result, normalized.identity.emailNormalized, deps);
  return { ok: true as const, ...result };
}
