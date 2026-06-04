import { redirect } from "next/navigation";
import { SlotStepClient } from "@/app/app/patient/booking/new/slot/SlotStepClient";
import { isPublicOnlineBookingCategory } from "@/shared/publicBook/onlineBookingCategories";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../../PublicBookingShell";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function PublicBookSlotPage({ searchParams }: Props) {
  const raw = await searchParams;
  const type = first(raw.type)?.trim();
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  if (type === "online") {
    const categoryRaw = first(raw.category)?.trim();
    if (!categoryRaw || !isPublicOnlineBookingCategory(categoryRaw)) {
      redirect(publicBookPaths.new);
    }
    return (
      <PublicBookingShell title="Выберите дату и время" step={3} totalSteps={4} backHref={publicBookPaths.new}>
        <SlotStepClient
          type="online"
          category={categoryRaw}
          appDisplayTimeZone={appDisplayTimeZone}
          confirmBasePath={publicBookPaths.newConfirm}
          slotsApiPath="/api/booking/public/slots"
        />
      </PublicBookingShell>
    );
  }

  if (type !== "in_person") {
    redirect(publicBookPaths.new);
  }

  const branchId = first(raw.branchId)?.trim();
  const serviceId = first(raw.serviceId)?.trim();
  const branchServiceId = first(raw.branchServiceId)?.trim();
  if ((!branchId || !serviceId) && !branchServiceId) {
    redirect(publicBookPaths.new);
  }

  const cityCode = first(raw.cityCode) ?? "";
  const cityTitle = first(raw.cityTitle) ?? "";
  const serviceTitle = first(raw.serviceTitle) ?? "";
  const durationMinutes = Number(first(raw.durationMinutes) ?? "60") || 60;
  const backHref =
    `${publicBookPaths.newService}?cityCode=${encodeURIComponent(cityCode)}&cityTitle=${encodeURIComponent(cityTitle)}`;

  return (
    <PublicBookingShell title="Выберите дату и время" step={3} totalSteps={4} backHref={backHref}>
      <SlotStepClient
        type="in_person"
        branchId={branchId}
        serviceId={serviceId}
        branchServiceId={branchServiceId}
        cityCode={cityCode}
        cityTitle={cityTitle}
        serviceTitle={serviceTitle}
        durationMinutes={durationMinutes}
        appDisplayTimeZone={appDisplayTimeZone}
        confirmBasePath={publicBookPaths.newConfirm}
        slotsApiPath="/api/booking/public/slots"
      />
    </PublicBookingShell>
  );
}
