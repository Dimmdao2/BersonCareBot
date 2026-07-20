import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseBookingAttributionFromSearchParams } from "@/modules/booking-attribution/parseBookingAttribution";
import { titleForBookingCityCode } from "@/modules/patient-booking/inPersonServicesCatalog";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../PublicBookingShell";
import { PublicFormatStepClient } from "./PublicFormatStepClient";
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

  const deps = buildAppDeps();
  const cities: BookingCity[] = [];
  const catalogError: string | null = "Каталог недоступен.";

  const { redirect } = await import("next/navigation");

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

  const branchServiceId = attr.branchServiceId;
  if (branchServiceId && deps.bookingScheduling && deps.bookingEngine) {
    try {
      const ctx = await deps.bookingScheduling.resolveInPersonContext(branchServiceId);
      if (ctx?.branchId && ctx.serviceId) {
        const [branch, service] = await Promise.all([
          deps.bookingEngine.catalog.getBranch(ctx.branchId),
          deps.bookingEngine.services.getService(ctx.serviceId),
        ]);
        if (!branch || !service || branch.organizationId !== ctx.organizationId || service.organizationId !== ctx.organizationId) {
          throw new Error("branch_service_not_found");
        }
        redirect(
          `${publicBookPaths.newSlot}?type=in_person` +
            `&cityCode=${encodeURIComponent(branch.cityCode)}` +
            `&cityTitle=${encodeURIComponent(titleForBookingCityCode(branch.cityCode))}` +
            `&branchId=${encodeURIComponent(ctx.branchId)}` +
            `&serviceId=${encodeURIComponent(ctx.serviceId)}` +
            `&serviceTitle=${encodeURIComponent(service.title)}` +
            `&durationMinutes=${encodeURIComponent(String(service.durationMinutes))}`,
        );
      }
    } catch {
      // unknown branch service — stay on format step
    }
  }

  return (
    <PublicBookingShell title="Запись" step={1} totalSteps={4} backHref={null}>
      <PublicFormatStepClient cities={cities} onlineLocation={null} catalogError={catalogError} />
    </PublicBookingShell>
  );
}
