import { redirect } from "next/navigation";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { BookingWizardShell } from "../BookingWizardShell";
import { SlotStepClient } from "./SlotStepClient";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
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
    const branchServiceId = first(raw.branchServiceId)?.trim();
    if (!branchServiceId) {
      redirect(routePaths.bookingNew);
    }
    const cityCode = first(raw.cityCode) ?? "";
    const cityTitle = first(raw.cityTitle) ?? "";
    const serviceTitle = first(raw.serviceTitle) ?? "";
    const backHref =
      `${routePaths.bookingNewService}?cityCode=${encodeURIComponent(cityCode)}&cityTitle=${encodeURIComponent(cityTitle)}`;

    return (
      <BookingWizardShell
        title="Выберите дату и время"
        step={3}
        totalSteps={4}
        backHref={backHref}
        user={session.user}
      >
        <SlotStepClient
          type="in_person"
          branchServiceId={branchServiceId}
          cityCode={cityCode}
          cityTitle={cityTitle}
          serviceTitle={serviceTitle}
        />
      </BookingWizardShell>
    );
  }

  const category = first(raw.category)?.trim();
  if (!category) {
    redirect(routePaths.bookingNew);
  }

  return (
    <BookingWizardShell
      title="Выберите дату и время"
      step={3}
      totalSteps={4}
      backHref={routePaths.bookingNew}
      user={session.user}
    >
      <SlotStepClient type="online" category={category} />
    </BookingWizardShell>
  );
}
