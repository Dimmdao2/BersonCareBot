import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
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
  if (type === "in_person") {
    const cityCode = first(raw.cityCode);
    const cityTitle = first(raw.cityTitle);
    const branchServiceId = first(raw.branchServiceId);
    const serviceTitle = first(raw.serviceTitle);
    if (cityCode) q.set("cityCode", cityCode);
    if (cityTitle != null) q.set("cityTitle", cityTitle);
    if (branchServiceId) q.set("branchServiceId", branchServiceId);
    if (serviceTitle != null) q.set("serviceTitle", serviceTitle);
  } else if (type === "online") {
    const category = first(raw.category);
    if (category) q.set("category", category);
  }
  return q.toString();
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
    const branchServiceId = first(raw.branchServiceId)?.trim();
    if (!branchServiceId) {
      redirect(routePaths.bookingNew);
    }
  } else {
    if (!first(raw.category)?.trim()) {
      redirect(routePaths.bookingNew);
    }
  }

  const backHref = `${routePaths.bookingNewSlot}?${buildSlotBackQuery(raw)}`;

  return (
    <BookingWizardShell
      title="Подтверждение записи"
      step={4}
      totalSteps={4}
      backHref={backHref}
      user={session.user}
    >
      <ConfirmStepClient
        type={type}
        cityCode={first(raw.cityCode)}
        cityTitle={first(raw.cityTitle)}
        branchServiceId={first(raw.branchServiceId)}
        serviceTitle={first(raw.serviceTitle)}
        category={first(raw.category)}
        date={date}
        slotStart={slot}
        slotEnd={slotEnd}
        defaultName={session.user.displayName}
        defaultPhone={session.user.phone ?? ""}
      />
    </BookingWizardShell>
  );
}
