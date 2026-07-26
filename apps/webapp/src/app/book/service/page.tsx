import { notFound, redirect } from "next/navigation";
import { ServiceStepClient } from "@/app/app/patient/booking/service/ServiceStepClient";
import { loadInPersonServicesForCityRsc } from "@/app/app/patient/booking/bookingCatalogRsc";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../PublicBookingShell";
import { loadPublicOrganizationServicesForCityRsc, resolvePublicOrganizationBySlugRsc } from "../publicOrganizationBooking";

type Props = {
  searchParams: Promise<{ cityCode?: string; cityTitle?: string; orgSlug?: string }>;
};

export default async function PublicBookServicePage({ searchParams }: Props) {
  const sp = await searchParams;
  const cityCode = sp.cityCode?.trim();
  const cityTitle = sp.cityTitle ?? "";
  const orgSlug = sp.orgSlug?.trim();
  const backHref = orgSlug ? publicBookPaths.forSlug(orgSlug) : publicBookPaths.new;
  if (!cityCode) {
    redirect(backHref);
  }

  // `orgSlug` present: canonical per-clinic entry `/book/{publicSlug}` (OWNER_RULINGS_2026-07-17.md
  // §1). Re-resolve through the same chokepoint on every step — never trust a round-tripped
  // organization id, only the opaque slug string. Absent: generic `/book/service` stays exactly as
  // before (fail-closed for anonymous, unchanged).
  const servicesCatalog = orgSlug
    ? await (async () => {
        const resolved = await resolvePublicOrganizationBySlugRsc(orgSlug);
        if (!resolved) notFound();
        return loadPublicOrganizationServicesForCityRsc(resolved.organizationId, cityCode);
      })()
    : await loadInPersonServicesForCityRsc(cityCode);

  if (!servicesCatalog.ok && servicesCatalog.error === "city_not_found") {
    redirect(backHref);
  }
  const catalogServices = servicesCatalog.ok ? servicesCatalog.services : [];
  const branchId = servicesCatalog.ok ? servicesCatalog.branchId : "";
  const catalogServicesError = servicesCatalog.ok ? null : "Не удалось загрузить услуги.";

  return (
    <PublicBookingShell title="Выберите услугу" step={2} totalSteps={4} backHref={backHref}>
      <ServiceStepClient
        cityCode={cityCode}
        cityTitle={cityTitle}
        branchId={branchId}
        services={catalogServices}
        catalogError={catalogServicesError}
        slotBasePath={publicBookPaths.newSlot}
        orgSlug={orgSlug}
      />
    </PublicBookingShell>
  );
}
