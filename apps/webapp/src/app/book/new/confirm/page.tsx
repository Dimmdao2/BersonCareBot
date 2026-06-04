import { redirect } from "next/navigation";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { isPublicOnlineBookingCategory } from "@/shared/publicBook/onlineBookingCategories";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../../PublicBookingShell";
import { PublicConfirmStepClient } from "./PublicConfirmStepClient";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function buildInPersonSlotBackQuery(raw: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  q.set("type", "in_person");
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
  return q.toString();
}

function buildOnlineSlotBackQuery(raw: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  q.set("type", "online");
  const category = first(raw.category);
  if (category) q.set("category", category);
  return q.toString();
}

export default async function PublicBookConfirmPage({ searchParams }: Props) {
  const raw = await searchParams;
  const type = first(raw.type)?.trim();
  if (type !== "in_person" && type !== "online") {
    redirect(publicBookPaths.new);
  }

  const date = first(raw.date)?.trim();
  const slot = first(raw.slot)?.trim();
  const slotEnd = first(raw.slotEnd)?.trim();

  if (!date || !slot || !slotEnd) {
    const backQ = type === "online" ? buildOnlineSlotBackQuery(raw) : buildInPersonSlotBackQuery(raw);
    redirect(`${publicBookPaths.newSlot}?${backQ}`);
  }

  if (type === "in_person") {
    const branchId = first(raw.branchId)?.trim();
    const serviceId = first(raw.serviceId)?.trim();
    const branchServiceId = first(raw.branchServiceId)?.trim();
    if ((!branchId || !serviceId) && !branchServiceId) redirect(publicBookPaths.new);
    const backHref = `${publicBookPaths.newSlot}?${buildInPersonSlotBackQuery(raw)}`;
    const appDisplayTimeZone = await getAppDisplayTimeZone();
    return (
      <PublicBookingShell title="Подтверждение" step={4} totalSteps={4} backHref={backHref}>
        <PublicConfirmStepClient
          type="in_person"
          cityCode={first(raw.cityCode)}
          cityTitle={first(raw.cityTitle)}
          branchId={branchId}
          serviceId={serviceId}
          branchServiceId={branchServiceId}
          serviceTitle={first(raw.serviceTitle)}
          slotStart={slot}
          slotEnd={slotEnd}
          appDisplayTimeZone={appDisplayTimeZone}
        />
      </PublicBookingShell>
    );
  }

  const category = first(raw.category)?.trim();
  if (!category || !isPublicOnlineBookingCategory(category)) {
    redirect(publicBookPaths.new);
  }
  const backHref = `${publicBookPaths.newSlot}?${buildOnlineSlotBackQuery(raw)}`;
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  return (
    <PublicBookingShell title="Подтверждение" step={4} totalSteps={4} backHref={backHref}>
      <PublicConfirmStepClient
        type="online"
        category={category}
        slotStart={slot}
        slotEnd={slotEnd}
        appDisplayTimeZone={appDisplayTimeZone}
      />
    </PublicBookingShell>
  );
}
