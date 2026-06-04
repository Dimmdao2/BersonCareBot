import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { ServiceStepClient } from "@/app/app/patient/booking/new/service/ServiceStepClient";
import { loadInPersonServicesForCityRsc } from "@/app/app/patient/booking/bookingCatalogRsc";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../../PublicBookingShell";

type Props = {
  searchParams: Promise<{ cityCode?: string; cityTitle?: string }>;
};

export default async function PublicBookServicePage({ searchParams }: Props) {
  const sp = await searchParams;
  const cityCode = sp.cityCode?.trim();
  const cityTitle = sp.cityTitle ?? "";
  if (!cityCode) {
    redirect(publicBookPaths.new);
  }

  const servicesCatalog = await loadInPersonServicesForCityRsc(cityCode);
  if (!servicesCatalog.ok && servicesCatalog.error === "city_not_found") {
    redirect(publicBookPaths.new);
  }
  const catalogServices = servicesCatalog.ok ? servicesCatalog.services : [];
  const branchId = servicesCatalog.ok ? servicesCatalog.branchId : "";
  const catalogServicesError = servicesCatalog.ok ? null : "Не удалось загрузить услуги.";

  return (
    <PublicBookingShell
      title="Выберите услугу"
      step={2}
      totalSteps={4}
      backHref={publicBookPaths.new}
    >
      <ServiceStepClient
        cityCode={cityCode}
        cityTitle={cityTitle}
        branchId={branchId}
        services={catalogServices}
        catalogError={catalogServicesError}
        slotBasePath={publicBookPaths.newSlot}
      />
    </PublicBookingShell>
  );
}
