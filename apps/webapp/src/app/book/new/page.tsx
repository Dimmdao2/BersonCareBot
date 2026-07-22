import { notFound, redirect } from "next/navigation";
import { parseBookingAttributionFromSearchParams } from "@/modules/booking-attribution/parseBookingAttribution";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../PublicBookingShell";
import { PublicFormatStepClient } from "./PublicFormatStepClient";
import { loadPublicInPersonSlotContextForSlugRsc } from "../publicOrganizationBooking";
import type { BookingCity } from "@/modules/booking-catalog/types";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function toSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  return new URLSearchParams(
    Object.entries(raw)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, first(v) ?? ""]),
  );
}

export default async function PublicBookNewPage({ searchParams }: Props) {
  const raw = await searchParams;
  const sp = toSearchParams(raw);
  const attr = parseBookingAttributionFromSearchParams(sp);

  const cities: BookingCity[] = [];
  const catalogError: string | null = "Каталог недоступен.";

  const onlineCategory = first(raw.category)?.trim();
  if (first(raw.type) === "online" && (onlineCategory === "rehab_lfk" || onlineCategory === "nutrition")) {
    redirect(`${publicBookPaths.newSlot}?type=online&category=${encodeURIComponent(onlineCategory)}`);
  }

  const presetCity = attr.presetCityCode?.trim().toLowerCase();
  if (presetCity && cities.some((c) => c.code.toLowerCase() === presetCity)) {
    const city = cities.find((c) => c.code.toLowerCase() === presetCity)!;
    redirect(
      `${publicBookPaths.newService}?cityCode=${encodeURIComponent(city.code)}&cityTitle=${encodeURIComponent(city.title)}`,
    );
  }

  if (attr.branchId && attr.serviceId) {
    const orgSlug = first(raw.orgSlug)?.trim();
    if (!orgSlug) return notFound();
    const context = await loadPublicInPersonSlotContextForSlugRsc({
      orgSlug,
      branchId: attr.branchId,
      serviceId: attr.serviceId,
    });
    if (!context.ok) return notFound();
    redirect(
      `${publicBookPaths.newSlot}?type=in_person` +
        `&orgSlug=${encodeURIComponent(orgSlug)}` +
        `&branchId=${encodeURIComponent(context.branchId)}` +
        `&serviceId=${encodeURIComponent(context.serviceId)}`,
    );
  }

  return (
    <PublicBookingShell title="Запись" step={1} totalSteps={4} backHref={null}>
      <PublicFormatStepClient cities={cities} onlineLocation={null} catalogError={catalogError} />
    </PublicBookingShell>
  );
}
