import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { parseFioCandidate, type StructuredFio } from "@/shared/lib/fio";
import type { SessionUser } from "@/shared/types/session";
import { bookingNewHref } from "../../bookingNewHref";
import { BOOKING_WIZARD_TOTAL_STEPS } from "../../constants";
import { BookingWizardShell } from "../BookingWizardShell";
import { ConfirmStepClient } from "./ConfirmStepClient";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function buildSlotBackQuery(raw: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  const type = first(raw.type)?.trim();
  if (type) q.set("type", type);
  const rescheduleBookingId = first(raw.rescheduleBookingId)?.trim();
  if (rescheduleBookingId) {
    q.set("rescheduleBookingId", rescheduleBookingId);
  }
  if (type === "in_person") {
    const cityCode = first(raw.cityCode);
    const cityTitle = first(raw.cityTitle);
    const branchId = first(raw.branchId);
    const serviceId = first(raw.serviceId);
    const branchServiceId = first(raw.branchServiceId);
    const serviceTitle = first(raw.serviceTitle);
    if (cityCode) q.set("cityCode", cityCode);
    if (cityTitle != null) q.set("cityTitle", cityTitle);
    if (branchId) q.set("branchId", branchId);
    if (serviceId) q.set("serviceId", serviceId);
    if (branchServiceId) q.set("branchServiceId", branchServiceId);
    if (serviceTitle != null) q.set("serviceTitle", serviceTitle);
    const durationMinutes = first(raw.durationMinutes);
    if (durationMinutes) q.set("durationMinutes", durationMinutes);
  } else if (type === "online") {
    const category = first(raw.category);
    if (category) q.set("category", category);
  }
  return q.toString();
}

function looksLikePatronymic(value: string | undefined): boolean {
  return /(вич|вна|ич|ична|оглы|кызы)$/i.test((value ?? "").toLowerCase().replace(/ё/g, "е"));
}

function deriveDefaultFio(user: SessionUser): StructuredFio {
  const parsed = parseFioCandidate(user.displayName, "display_name").value;
  const firstName = user.firstName?.trim() || parsed.firstName;
  const tokens = user.displayName.trim().split(/\s+/).filter(Boolean);
  if (firstName && tokens.length >= 2) {
    const firstLower = firstName.toLowerCase().replace(/ё/g, "е");
    const tokenLower = tokens.map((token) => token.toLowerCase().replace(/ё/g, "е"));
    const firstIndex = tokenLower.indexOf(firstLower);
    if (firstIndex >= 0) {
      const secondLooksPatronymic = looksLikePatronymic(tokens[1]);
      return {
        lastName:
          firstIndex === 0
            ? secondLooksPatronymic
              ? tokens[2] ?? parsed.lastName
              : tokens[1] ?? parsed.lastName
            : tokens[0] ?? parsed.lastName,
        firstName,
        patronymic:
          firstIndex === 0
            ? secondLooksPatronymic
              ? tokens[1] ?? parsed.patronymic
              : tokens[2] ?? parsed.patronymic
            : tokens[2] ?? parsed.patronymic,
      };
    }
  }
  return {
    lastName: parsed.lastName,
    firstName,
    patronymic: parsed.patronymic,
  };
}

export default async function BookingNewConfirmPage({ searchParams }: Props) {
  const session = await getOptionalPatientSession();
  if (!session) {
    redirect(routePaths.patient);
  }

  const raw = await searchParams;
  const type = first(raw.type)?.trim();
  if (!type || (type !== "in_person" && type !== "online")) {
    redirect(routePaths.bookingNew);
  }

  const date = first(raw.date)?.trim();
  const slot = first(raw.slot)?.trim();
  const slotEnd = first(raw.slotEnd)?.trim();

  if (!date || !slot || !slotEnd) {
    redirect(`${routePaths.bookingNewSlot}?${buildSlotBackQuery(raw)}`);
  }

  if (type === "in_person") {
    const branchId = first(raw.branchId)?.trim();
    const serviceId = first(raw.serviceId)?.trim();
    const branchServiceId = first(raw.branchServiceId)?.trim();
    if ((!branchId || !serviceId) && !branchServiceId) {
      redirect(routePaths.bookingNew);
    }
  } else {
    if (!first(raw.category)?.trim()) {
      redirect(routePaths.bookingNew);
    }
  }

  const backHref = `${routePaths.bookingNewSlot}?${buildSlotBackQuery(raw)}`;
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  const cityCodeForLinks = first(raw.cityCode);
  const successRedirectPath = bookingNewHref(cityCodeForLinks);

  const rescheduleBookingId = first(raw.rescheduleBookingId)?.trim();
  const deps = buildAppDeps();
  const profileEmail = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const defaultFio = deriveDefaultFio(session.user);

  return (
    <BookingWizardShell
      title={rescheduleBookingId ? "Подтверждение переноса" : "Подтверждение записи"}
      step={4}
      totalSteps={BOOKING_WIZARD_TOTAL_STEPS}
      backHref={backHref}
      user={session.user}
    >
      <ConfirmStepClient
        type={type}
        successRedirectPath={successRedirectPath}
        cityCode={cityCodeForLinks}
        cityTitle={first(raw.cityTitle)}
        branchId={first(raw.branchId)}
        serviceId={first(raw.serviceId)}
        branchServiceId={first(raw.branchServiceId)}
        serviceTitle={first(raw.serviceTitle)}
        category={first(raw.category)}
        slotStart={slot}
        slotEnd={slotEnd}
        defaultFio={defaultFio}
        defaultPhone={session.user.phone ?? ""}
        defaultEmail={profileEmail.email ?? ""}
        appDisplayTimeZone={appDisplayTimeZone}
        rescheduleBookingId={rescheduleBookingId}
      />
    </BookingWizardShell>
  );
}
