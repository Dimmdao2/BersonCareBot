import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseBookingAttributionFromSearchParams } from "@/modules/booking-attribution/parseBookingAttribution";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../PublicBookingShell";
import { PublicFormatStepClient } from "./PublicFormatStepClient";

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
  let cities: Awaited<ReturnType<NonNullable<typeof deps.bookingCatalog>["listCitiesForPatient"]>> = [];
  let catalogError: string | null = null;
  if (deps.bookingCatalog) {
    try {
      cities = await deps.bookingCatalog.listCitiesForPatient();
    } catch {
      catalogError = "Не удалось загрузить каталог.";
    }
  } else {
    catalogError = "Каталог недоступен.";
  }

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
  if (branchServiceId && deps.bookingScheduling) {
    try {
      const ctx = await deps.bookingScheduling.resolveInPersonContext(branchServiceId);
      const legacy =
        deps.bookingCatalog != null
          ? await deps.bookingCatalog.resolveBranchService(branchServiceId).catch(() => null)
          : null;
      const cityCode = legacy?.city.code ?? "";
      const cityTitle = legacy?.city.title ?? "";
      const title = legacy?.service.title ?? "";
      const dur = legacy?.service.durationMinutes ?? 60;
      if (ctx?.branchId && ctx.serviceId) {
        redirect(
          `${publicBookPaths.newSlot}?type=in_person` +
            `&cityCode=${encodeURIComponent(cityCode)}` +
            `&cityTitle=${encodeURIComponent(cityTitle)}` +
            `&branchId=${encodeURIComponent(ctx.branchId)}` +
            `&serviceId=${encodeURIComponent(ctx.serviceId)}` +
            `&serviceTitle=${encodeURIComponent(title)}` +
            `&durationMinutes=${encodeURIComponent(String(dur))}`,
        );
      }
    } catch {
      // unknown branch service — stay on format step
    }
  } else if (branchServiceId && deps.bookingCatalog) {
    try {
      const resolved = await deps.bookingCatalog.resolveBranchService(branchServiceId);
      const title = resolved.service.title;
      const dur = resolved.service.durationMinutes;
      redirect(
        `${publicBookPaths.newSlot}?type=in_person` +
          `&cityCode=${encodeURIComponent(resolved.city.code)}` +
          `&cityTitle=${encodeURIComponent(resolved.city.title)}` +
          `&branchServiceId=${encodeURIComponent(branchServiceId)}` +
          `&serviceTitle=${encodeURIComponent(title)}` +
          `&durationMinutes=${encodeURIComponent(String(dur))}`,
      );
    } catch {
      // unknown branch service — stay on format step
    }
  }

  return (
    <PublicBookingShell title="Запись" step={1} totalSteps={4} backHref={null}>
      <PublicFormatStepClient cities={cities} catalogError={catalogError} />
    </PublicBookingShell>
  );
}
