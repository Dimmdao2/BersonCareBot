import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import type { BookingCategory } from "@/modules/patient-booking/types";
import {
  loadInPersonSlotContextForPatientRsc,
  loadPatientBookingDisplaySettingsRsc,
} from "../../bookingCatalogRsc";
import { BOOKING_WIZARD_TOTAL_STEPS } from "../../constants";
import { BookingWizardShell } from "../BookingWizardShell";
import { SlotStepClient } from "./SlotStepClient";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

const ONLINE_BOOKING_CATEGORIES: readonly BookingCategory[] = ["rehab_lfk", "nutrition", "general"];

function isOnlineBookingCategory(s: string): s is BookingCategory {
  return (ONLINE_BOOKING_CATEGORIES as readonly string[]).includes(s);
}

export default async function BookingNewSlotPage({ searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  const raw = await searchParams;
  const type = first(raw.type)?.trim();
  if (!type || (type !== "in_person" && type !== "online")) {
    redirect(routePaths.bookingNew);
  }

  if (type === "in_person") {
    const branchId = first(raw.branchId)?.trim();
    const serviceId = first(raw.serviceId)?.trim();
    if (!branchId || !serviceId) {
      redirect(routePaths.bookingNew);
    }
    const slotContext = await loadInPersonSlotContextForPatientRsc({
      platformUserId: session.user.userId,
      branchId,
      serviceId,
    });
    if (!slotContext.ok) {
      redirect(routePaths.bookingNew);
    }
    const rescheduleBookingId = first(raw.rescheduleBookingId)?.trim();
    const backHref =
      `${routePaths.bookingNewService}?cityCode=${encodeURIComponent(slotContext.cityCode)}&cityTitle=${encodeURIComponent(slotContext.cityTitle)}`;

    return (
      <BookingWizardShell
        title={rescheduleBookingId ? "Новое время приёма" : "Выберите дату и время"}
        step={3}
        totalSteps={BOOKING_WIZARD_TOTAL_STEPS}
        backHref={backHref}
        user={session.user}
      >
        <SlotStepClient
          type="in_person"
          branchId={slotContext.branchId}
          serviceId={slotContext.serviceId}
          cityCode={slotContext.cityCode}
          cityTitle={slotContext.cityTitle}
          serviceTitle={slotContext.serviceTitle}
          durationMinutes={slotContext.durationMinutes}
          priceMinor={slotContext.priceMinor}
          maxConsecutiveSlotHours={slotContext.maxConsecutiveSlotHours}
          appDisplayTimeZone={slotContext.appDisplayTimeZone}
          rescheduleBookingId={rescheduleBookingId}
        />
      </BookingWizardShell>
    );
  }

  const categoryRaw = first(raw.category)?.trim();
  if (!categoryRaw || !isOnlineBookingCategory(categoryRaw)) {
    redirect(routePaths.bookingNew);
  }
  const category = categoryRaw;
  const rescheduleBookingId = first(raw.rescheduleBookingId)?.trim();
  const displaySettings = await loadPatientBookingDisplaySettingsRsc(session.user.userId);
  if (!displaySettings.ok) {
    redirect(routePaths.bookingNew);
  }

  return (
    <BookingWizardShell
      title={rescheduleBookingId ? "Новое время приёма" : "Выберите дату и время"}
      step={3}
      totalSteps={BOOKING_WIZARD_TOTAL_STEPS}
      backHref={routePaths.bookingNew}
      user={session.user}
    >
      <SlotStepClient
        type="online"
        category={category}
        appDisplayTimeZone={displaySettings.appDisplayTimeZone}
        maxConsecutiveSlotHours={3}
        rescheduleBookingId={rescheduleBookingId}
      />
    </BookingWizardShell>
  );
}
