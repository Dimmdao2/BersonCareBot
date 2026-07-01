import type { BookingCatalogService } from "@/modules/booking-catalog/service";
import type { createBookingEngineService } from "@/modules/booking-engine/service";
import type { AppointmentStatus, BeAppointment } from "@/modules/booking-engine/types";

type BookingEngineService = ReturnType<typeof createBookingEngineService>;
import type { createBookingFormService } from "@/modules/booking-form/service";
import type { createBookingSchedulingService } from "@/modules/booking-scheduling/service";

type BookingFormService = ReturnType<typeof createBookingFormService>;
type BookingSchedulingService = ReturnType<typeof createBookingSchedulingService>;
import type { AppointmentProjectionPort } from "./ports";
import type { PaymentsService } from "@/modules/payments/service";
import type { MembershipsService } from "@/modules/memberships/service";
import type { ProductsService } from "@/modules/products/service";
import type { ClientHistoryService } from "@/modules/client-history/service";
import type { PlatformUserContactsService } from "@/modules/platform-user-contacts/service";
import type { IdentityContactFields } from "@/modules/platform-user-contacts/identityContactMatch";
import { upsertBookingFormContactsBestEffort } from "@/modules/platform-user-contacts/bookingContactUpsert";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type {
  BookingSyncPort,
  PatientBookingsPort,
  CreatePendingPatientBookingInput,
  LegacyBranchProjectionPort,
} from "./ports";
import type { CreatePatientBookingInput, PatientBookingRecord } from "./types";
import type { BookingSlotsReadSource } from "./slotsReadSource";
import type { ResolvedBranchService } from "@/modules/booking-catalog/types";
import { extractRubitimeManageUrlFromIntegratorCreateRaw } from "./rubitimeManageUrl";
import { projectCanonicalAppointmentForDoctor } from "./projectCanonicalAppointment";
import { resolveLegacyBranchIdForProjection } from "./resolveLegacyBranchIdForProjection";
import {
  resolveBookingNotifyTargets,
  type BookingLifecycleNotificationsSettings,
} from "./bookingLifecycleNotifications";
import {
  rollbackFailedRubitimeCreate,
  waitForRubitimeProjectionMapping,
} from "./rubitimeCreateRollback";

function isPostgresExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01";
}

async function persistBookingFormContacts(deps: CanonicalBookingDeps, createInput: CreatePatientBookingInput) {
  const identity =
    deps.getPlatformUserIdentityContacts != null
      ? await deps.getPlatformUserIdentityContacts(createInput.userId)
      : null;
  await upsertBookingFormContactsBestEffort(deps.platformUserContacts, {
    platformUserId: createInput.userId,
    contactPhone: createInput.contactPhone,
    contactEmail: createInput.contactEmail,
    identity,
  });
}

export type CanonicalBookingDeps = {
  bookingsPort: PatientBookingsPort;
  syncPort: BookingSyncPort;
  bookingCatalog: BookingCatalogService | null;
  bookingEngine: BookingEngineService | null;
  bookingScheduling: BookingSchedulingService | null;
  bookingForm: BookingFormService | null;
  appointmentProjection: AppointmentProjectionPort | null;
  payments: PaymentsService | null;
  memberships: MembershipsService | null;
  products: ProductsService | null;
  clientHistory: ClientHistoryService | null;
  platformUserContacts?: PlatformUserContactsService | null;
  getPlatformUserIdentityContacts?: (userId: string) => Promise<IdentityContactFields | null>;
  isRubitimeBridgeEnabled: () => Promise<boolean>;
  resolveSlotsReadSource?: () => Promise<BookingSlotsReadSource>;
  getBookingLifecycleNotificationSettings?: () => Promise<BookingLifecycleNotificationsSettings | null>;
  branches?: LegacyBranchProjectionPort | null;
};

function toPendingRowOnline(
  input: CreatePatientBookingInput & { type: "online" },
): CreatePendingPatientBookingInput {
  return {
    userId: input.userId,
    bookingType: "online",
    city: null,
    category: input.category,
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail ?? null,
    branchId: null,
    serviceId: null,
    branchServiceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
  };
}

function toPendingRowInPerson(
  input: CreatePatientBookingInput & { type: "in_person" },
  resolved: Awaited<ReturnType<BookingCatalogService["resolveBranchService"]>>,
): CreatePendingPatientBookingInput {
  const { branch, service, branchService, specialist, city } = resolved!;
  return {
    userId: input.userId,
    bookingType: "in_person",
    city: city.code,
    category: "general",
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail ?? null,
    branchId: branch.id,
    serviceId: service.id,
    branchServiceId: branchService.id,
    cityCodeSnapshot: city.code,
    branchTitleSnapshot: branch.title,
    serviceTitleSnapshot: service.title,
    durationMinutesSnapshot: service.durationMinutes,
    priceMinorSnapshot: service.priceMinor,
    rubitimeBranchIdSnapshot: branch.rubitimeBranchId,
    rubitimeCooperatorIdSnapshot: specialist.rubitimeCooperatorId,
    rubitimeServiceIdSnapshot: branchService.rubitimeServiceId,
  };
}

async function createRubitimeRecord(
  deps: CanonicalBookingDeps,
  createInput: CreatePatientBookingInput,
  pendingId: string,
  resolved: ResolvedBranchService | undefined,
): Promise<{ rubitimeId: string; raw: Record<string, unknown> }> {
  let sync: { rubitimeId: string | null; raw: Record<string, unknown> };
  if (createInput.type === "online") {
    sync = await deps.syncPort.createRecord({
      type: "online",
      category: createInput.category,
      slotStart: createInput.slotStart,
      slotEnd: createInput.slotEnd,
      contactName: createInput.contactName,
      contactPhone: createInput.contactPhone,
      contactEmail: createInput.contactEmail,
    });
  } else if (resolved) {
    sync = await deps.syncPort.createRecord({
      version: "v2",
      rubitimeBranchId: resolved.branch.rubitimeBranchId,
      rubitimeCooperatorId: resolved.specialist.rubitimeCooperatorId,
      rubitimeServiceId: resolved.branchService.rubitimeServiceId,
      slotStart: createInput.slotStart,
      contactName: createInput.contactName,
      contactPhone: createInput.contactPhone,
      contactEmail: createInput.contactEmail,
      localBookingId: pendingId,
    });
  } else {
    throw new Error("catalog_unavailable");
  }
  const rubitimeId = sync.rubitimeId?.trim() ?? "";
  if (!rubitimeId) throw new Error("rubitime_id_missing");
  return { rubitimeId, raw: sync.raw };
}

/**
 * Rubitime-first create runs integrator postCreateProjection before this returns.
 * Re-use the projected `be_appointments` row — never insert a second native row (overlap).
 */
async function resolveCanonicalAppointmentAfterRubitimeCreate(
  deps: CanonicalBookingDeps,
  input: {
    organizationId: string;
    rubitimeId: string;
    targetStatus: AppointmentStatus;
    pendingBookingId: string;
  },
): Promise<BeAppointment> {
  if (!deps.bookingEngine) throw new Error("canonical_booking_unavailable");
  const projectedId = await waitForRubitimeProjectionMapping(deps.bookingEngine, {
    organizationId: input.organizationId,
    rubitimeId: input.rubitimeId,
  });
  if (!projectedId) {
    await deps.bookingsPort.markFailedSync(input.pendingBookingId);
    await rollbackFailedRubitimeCreate({
      syncPort: deps.syncPort,
      bookingEngine: deps.bookingEngine,
      organizationId: input.organizationId,
      rubitimeId: input.rubitimeId,
    });
    throw new Error("rubitime_projection_not_ready");
  }
  const existing = await deps.bookingEngine.getAppointment(projectedId);
  if (!existing) throw new Error("projected_appointment_missing");
  if (existing.status === input.targetStatus) return existing;
  try {
    return await deps.bookingEngine.transitionAppointmentStatus({
      appointmentId: existing.id,
      toStatus: input.targetStatus,
      payload: { source: "patient_booking_rubitime_first" },
    });
  } catch {
    return existing;
  }
}

export async function createBookingOnCanonicalEngine(
  deps: CanonicalBookingDeps,
  createInput: CreatePatientBookingInput,
  formAnswers: { fieldKey: string; value: string }[] = [],
): Promise<PatientBookingRecord> {
  if (!deps.bookingEngine || !deps.bookingScheduling) {
    throw new Error("canonical_booking_unavailable");
  }

  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  if (deps.clientHistory) {
    await deps.clientHistory.assertSelfServiceBookingAllowed(orgId, createInput.userId);
  }
  const profilePrefill: Record<string, string> = {
    contact_name: createInput.contactName,
    contact_phone: createInput.contactPhone,
    first_name: createInput.contactFio?.firstName ?? createInput.contactName,
    ...(createInput.contactFio?.lastName ? { last_name: createInput.contactFio.lastName } : {}),
    ...(createInput.contactFio?.patronymic ? { patronymic: createInput.contactFio.patronymic } : {}),
    phone: createInput.contactPhone,
    ...(createInput.contactEmail ? { contact_email: createInput.contactEmail, email: createInput.contactEmail } : {}),
  };

  if (deps.bookingForm) {
    const validation = await deps.bookingForm.validateAnswers(orgId, "patient", formAnswers, profilePrefill);
    if (!validation.ok) throw new Error(validation.error);
  }

  const slotsReadSource = (await deps.resolveSlotsReadSource?.()) ?? "canonical";
  const rubitimeFirst = slotsReadSource === "rubitime";

  let pendingRow: CreatePendingPatientBookingInput;
  let durationMinutes = 60;
  let resolved: Awaited<ReturnType<BookingCatalogService["resolveBranchService"]>> | undefined;
  let canonicalBranchId: string | null = null;
  let canonicalSpecialistId: string | null = null;
  let canonicalServiceId: string | null = null;
  let canonicalRoomId: string | null = null;

  if (createInput.type === "online") {
    pendingRow = toPendingRowOnline(createInput);
    if (!rubitimeFirst) {
      await deps.bookingScheduling.assertSlotAvailable({
        organizationId: orgId,
        specialistId: null,
        roomId: null,
        slotStart: createInput.slotStart,
        slotEnd: createInput.slotEnd,
        durationMinutes: 60,
      });
    }
  } else {
    if (!deps.bookingCatalog) throw new Error("catalog_unavailable");
    resolved = await deps.bookingCatalog.resolveBranchService(createInput.branchServiceId);
    if (!resolved) throw new Error("branch_service_not_found");
    const expectedCity = resolved.city.code.trim().toLowerCase();
    if (createInput.cityCode.trim().toLowerCase() !== expectedCity) throw new Error("city_mismatch");
    pendingRow = toPendingRowInPerson(createInput, resolved);
    durationMinutes = resolved.service.durationMinutes;
    if (!rubitimeFirst) {
      await deps.bookingScheduling.assertSlotAvailable({
        branchServiceId: createInput.branchServiceId,
        slotStart: createInput.slotStart,
        slotEnd: createInput.slotEnd,
        durationMinutes,
      });
    }
    const ctx = await deps.bookingScheduling.resolveInPersonContext(createInput.branchServiceId);
    if (!ctx) throw new Error("branch_service_not_found");
    // In-person bookings MUST resolve a concrete specialist: a NULL specialist_id
    // bypasses the be_appointments_specialist_no_overlap exclusion constraint
    // (it only covers non-null rows), allowing an overlapping booking. Only ONLINE
    // consults legitimately keep canonicalSpecialistId = null. (F2 guard.)
    if (!ctx.specialistId) throw new Error("specialist_required");
    canonicalBranchId = ctx.branchId;
    canonicalSpecialistId = ctx.specialistId;
    canonicalServiceId = ctx.serviceId;
    canonicalRoomId = ctx.roomId;
  }

  const slotDurationMinutes = Math.max(
    1,
    Math.round((new Date(createInput.slotEnd).getTime() - new Date(createInput.slotStart).getTime()) / 60_000),
  );
  if (pendingRow.durationMinutesSnapshot != null) {
    pendingRow = { ...pendingRow, durationMinutesSnapshot: slotDurationMinutes };
  }

  const pending = await deps.bookingsPort.createPending(pendingRow);

  let packageCoversVisit = false;
  let productCoversVisit = false;
  let patientPackageId =
    createInput.type === "in_person" ? createInput.patientPackageId?.trim() : undefined;
  const productPurchaseId =
    createInput.type === "in_person" ? createInput.productPurchaseId?.trim() : undefined;
  if (patientPackageId && productPurchaseId) {
    throw new Error("payment_option_conflict");
  }
  if (
    createInput.type === "in_person" &&
    !productPurchaseId &&
    !patientPackageId &&
    canonicalServiceId &&
    deps.memberships
  ) {
    const picked = await deps.memberships.pickAutoPackageForBooking(
      createInput.userId,
      orgId,
      canonicalServiceId,
    );
    if (picked) patientPackageId = picked.id;
  }
  if (patientPackageId) {
    if (!canonicalServiceId || !deps.memberships) {
      throw new Error("package_not_found");
    }
    const eligible = await deps.memberships.listActivePackagesForBooking(
      createInput.userId,
      orgId,
      canonicalServiceId,
    );
    if (!eligible.some((p) => p.id === patientPackageId)) {
      throw new Error("package_not_found");
    }
    packageCoversVisit = true;
  }
  if (productPurchaseId) {
    if (!canonicalServiceId || !deps.products) {
      throw new Error("product_purchase_not_found");
    }
    const eligible = await deps.products.listActivePurchasesForBooking(
      createInput.userId,
      orgId,
      canonicalServiceId,
    );
    if (!eligible.some((p) => p.id === productPurchaseId)) {
      throw new Error("product_purchase_not_found");
    }
    productCoversVisit = true;
  }

  const prepayQuote = deps.payments
    ? await deps.payments.resolvePrepayment({
        organizationId: orgId,
        serviceId: canonicalServiceId,
        onlineCategory: createInput.type === "online" ? createInput.category : null,
        servicePriceMinor: pendingRow.priceMinorSnapshot,
        currency: "RUB",
      })
    : null;
  const needsPrepayment =
    !packageCoversVisit &&
    !productCoversVisit &&
    prepayQuote?.required === true &&
    (prepayQuote.amountMinor ?? 0) > 0;
  const initialAppointmentStatus = needsPrepayment ? "awaiting_payment" : "confirmed";

  const phoneNormalized = normalizeRuPhoneE164(createInput.contactPhone) ?? createInput.contactPhone.trim();
  let rubitimeId: string | null = null;
  let rubitimeManageUrl: string | null = null;

  if (rubitimeFirst) {
    try {
      const sync = await createRubitimeRecord(deps, createInput, pending.id, resolved);
      rubitimeId = sync.rubitimeId;
      rubitimeManageUrl = extractRubitimeManageUrlFromIntegratorCreateRaw(sync.raw);
    } catch (err) {
      await deps.bookingsPort.markFailedSync(pending.id);
      const code = err instanceof Error ? err.message : "rubitime_sync_failed";
      throw new Error(code === "rubitime_id_missing" ? code : "rubitime_sync_failed");
    }
  }

  let appointment;
  try {
    appointment =
      rubitimeFirst && rubitimeId
        ? await resolveCanonicalAppointmentAfterRubitimeCreate(deps, {
            organizationId: orgId,
            rubitimeId,
            targetStatus: initialAppointmentStatus,
            pendingBookingId: pending.id,
          })
        : await deps.bookingEngine.createAppointment({
            organizationId: orgId,
            branchId: canonicalBranchId,
            roomId: canonicalRoomId,
            specialistId: canonicalSpecialistId,
            serviceId: canonicalServiceId,
            platformUserId: createInput.userId,
            startAt: createInput.slotStart,
            endAt: createInput.slotEnd,
            durationMinutes: slotDurationMinutes,
            source: createInput.bookingChannel === "public_widget" ? "public_widget" : "native",
            status: initialAppointmentStatus,
            phoneNormalized,
            actorId: createInput.userId,
            attributionJson: {
              ...(createInput.attribution ?? {}),
              ...(createInput.contactFio ? { contactFio: createInput.contactFio } : {}),
              ...(productPurchaseId ? { productPurchaseId } : {}),
            },
          });
  } catch (err) {
    const errCode = err instanceof Error ? err.message : "";
    if (errCode !== "rubitime_projection_not_ready") {
      await deps.bookingsPort.markFailedSync(pending.id);
      if (rubitimeFirst && rubitimeId) {
        await rollbackFailedRubitimeCreate({
          syncPort: deps.syncPort,
          bookingEngine: deps.bookingEngine,
          organizationId: orgId,
          rubitimeId,
        });
      }
    }
    if (isPostgresExclusionViolation(err)) throw new Error("slot_overlap");
    throw err;
  }

  if (deps.bookingForm && formAnswers.length > 0) {
    await deps.bookingForm.saveForAppointment(orgId, appointment.id, formAnswers);
  }

  if (rubitimeFirst && rubitimeId) {
    await deps.bookingEngine.upsertRubitimeAppointmentMapping({
      organizationId: orgId,
      appointmentId: appointment.id,
      rubitimeId,
    });
  }

  const bridgeEnabled = !rubitimeFirst && (await deps.isRubitimeBridgeEnabled());

  if (bridgeEnabled) {
    try {
      const sync = await createRubitimeRecord(deps, createInput, pending.id, resolved);
      rubitimeId = sync.rubitimeId;
      rubitimeManageUrl = extractRubitimeManageUrlFromIntegratorCreateRaw(sync.raw);
      await deps.bookingEngine.upsertRubitimeAppointmentMapping({
        organizationId: orgId,
        appointmentId: appointment.id,
        rubitimeId,
      });
    } catch {
      // Rubitime sync is best-effort; canonical appointment remains primary.
    }
  }

  if (needsPrepayment && deps.payments && prepayQuote) {
    await deps.payments.createAppointmentPaymentIntent({
      organizationId: orgId,
      appointmentId: appointment.id,
      platformUserId: createInput.userId,
      amountMinor: prepayQuote.amountMinor,
      currency: prepayQuote.currency,
      idempotencyKey: `appointment_prepay:${appointment.id}`,
    });
    const awaiting = await deps.bookingsPort.markAwaitingPayment(pending.id, appointment.id, {
      rubitimeId,
      rubitimeManageUrl,
    });
    await persistBookingFormContacts(deps, createInput);
    return awaiting ?? pending;
  }

  if (packageCoversVisit && patientPackageId && canonicalServiceId && deps.memberships) {
    try {
      await deps.memberships.reserveForAppointment({
        organizationId: orgId,
        patientPackageId,
        serviceId: canonicalServiceId,
        appointmentId: appointment.id,
        platformUserId: createInput.userId,
      });
    } catch (reserveErr) {
      await deps.bookingsPort.markFailedSync(pending.id);
      if (rubitimeFirst && rubitimeId) {
        await rollbackFailedRubitimeCreate({
          syncPort: deps.syncPort,
          bookingEngine: deps.bookingEngine,
          organizationId: orgId,
          rubitimeId,
          appointmentId: appointment.id,
        });
      } else {
        try {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: appointment.id,
            toStatus: "cancelled_by_specialist",
            payload: { source: "package_reserve_failed" },
          });
        } catch {
          // Best-effort rollback of orphan appointment.
        }
      }
      const code =
        reserveErr instanceof Error &&
        (reserveErr.message === "package_not_found" ||
          reserveErr.message === "package_no_balance" ||
          reserveErr.message === "package_expired" ||
          reserveErr.message === "package_not_active")
          ? reserveErr.message
          : "package_reserve_failed";
      throw new Error(code);
    }
  }

  if (productCoversVisit && productPurchaseId && canonicalServiceId && deps.products) {
    try {
      await deps.products.consumeVisitForAppointment({
        organizationId: orgId,
        productPurchaseId,
        platformUserId: createInput.userId,
        appointmentId: appointment.id,
        serviceId: canonicalServiceId,
      });
    } catch (consumeErr) {
      await deps.bookingsPort.markFailedSync(pending.id);
      if (rubitimeFirst && rubitimeId) {
        await rollbackFailedRubitimeCreate({
          syncPort: deps.syncPort,
          bookingEngine: deps.bookingEngine,
          organizationId: orgId,
          rubitimeId,
          appointmentId: appointment.id,
        });
      } else {
        try {
          await deps.bookingEngine.transitionAppointmentStatus({
            appointmentId: appointment.id,
            toStatus: "cancelled_by_specialist",
            payload: { source: "product_consume_failed" },
          });
        } catch {
          // Best-effort rollback of orphan appointment.
        }
      }
      const code =
        consumeErr instanceof Error &&
        (consumeErr.message === "product_purchase_not_found" ||
          consumeErr.message === "product_no_visits" ||
          consumeErr.message === "product_expired" ||
          consumeErr.message === "product_not_active" ||
          consumeErr.message === "product_service_mismatch")
          ? consumeErr.message
          : "product_consume_failed";
      throw new Error(code);
    }
  }

  const confirmed = await deps.bookingsPort.markConfirmed(pending.id, rubitimeId, {
    rubitimeManageUrl,
    canonicalAppointmentId: appointment.id,
  });
  if (!confirmed) {
    await deps.bookingsPort.markFailedSync(pending.id);
    if (rubitimeFirst && rubitimeId) {
      await rollbackFailedRubitimeCreate({
        syncPort: deps.syncPort,
        bookingEngine: deps.bookingEngine,
        organizationId: orgId,
        rubitimeId,
        appointmentId: appointment.id,
      });
    } else {
      try {
        await deps.bookingEngine.transitionAppointmentStatus({
          appointmentId: appointment.id,
          toStatus: "cancelled_by_specialist",
          payload: { source: "booking_confirm_failed" },
        });
      } catch {
        // Best-effort rollback of orphan canonical appointment.
      }
    }
    throw new Error("booking_confirm_failed");
  }

  // Rubitime post-create projection already fills appointment_records; skip native `be:` row.
  if (deps.appointmentProjection && !rubitimeId) {
    try {
      const legacyBranchId = await resolveLegacyBranchIdForProjection(
        deps.branches,
        pendingRow.rubitimeBranchIdSnapshot,
        pendingRow.branchTitleSnapshot,
      );
      await projectCanonicalAppointmentForDoctor(deps.appointmentProjection, appointment, {
        phoneNormalized,
        contactName: createInput.contactName,
        serviceTitle: pendingRow.serviceTitleSnapshot,
        branchTitle: pendingRow.branchTitleSnapshot,
        legacyBranchId,
      });
    } catch {
      // Doctor projection is best-effort on transition.
    }
  }

  if (packageCoversVisit && patientPackageId && deps.bookingEngine) {
    try {
      const { emitPackageLinkedCalendarSync } = await import(
        "@/app-layer/booking/emitPackageCalendarSync"
      );
      const freshAppt = await deps.bookingEngine.getAppointment(appointment.id);
      if (freshAppt) {
        await emitPackageLinkedCalendarSync(deps.syncPort, freshAppt, confirmed ?? pending);
      }
    } catch {
      // Calendar package marker sync is best-effort.
    }
  }

  try {
    const createNotify = resolveBookingNotifyTargets(
      "booking.created",
      { notifyPatient: true, notifyStaff: true },
      (await deps.getBookingLifecycleNotificationSettings?.()) ?? null,
    );
    if (createNotify.notifyPatient || createNotify.notifyStaff) {
      await deps.syncPort.emitBookingEvent({
        eventType: "booking.created",
        idempotencyKey: `booking.created:${pending.id}`,
        payload: {
          bookingId: (confirmed ?? pending).id,
          userId: createInput.userId,
          rubitimeId,
          bookingType: pendingRow.bookingType,
          city: pendingRow.city ?? undefined,
          category: pendingRow.category,
          slotStart: pendingRow.slotStart,
          slotEnd: pendingRow.slotEnd,
          contactName: pendingRow.contactName,
          ...(createInput.contactFio ? { contactFio: createInput.contactFio } : {}),
          contactPhone: pendingRow.contactPhone,
          contactEmail: pendingRow.contactEmail ?? undefined,
          branchServiceId: pendingRow.branchServiceId,
          cityCodeSnapshot: pendingRow.cityCodeSnapshot,
          serviceTitleSnapshot: pendingRow.serviceTitleSnapshot,
          canonicalAppointmentId: appointment.id,
        },
      });
    }
  } catch {
    // Notifications are best-effort.
  }

  await persistBookingFormContacts(deps, createInput);
  return confirmed ?? pending;
}
