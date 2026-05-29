import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { ServiceStepClient } from "@/app/app/patient/booking/new/service/ServiceStepClient";
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

  const deps = buildAppDeps();
  let catalogServices: Awaited<ReturnType<NonNullable<typeof deps.bookingCatalog>["listServicesByCity"]>> = [];
  let catalogServicesError: string | null = null;
  if (deps.bookingCatalog) {
    try {
      catalogServices = await deps.bookingCatalog.listServicesByCity(cityCode);
    } catch (err) {
      if (err instanceof Error && err.message === "city_not_found") {
        redirect(publicBookPaths.new);
      }
      catalogServicesError = "Не удалось загрузить услуги.";
    }
  } else {
    catalogServicesError = "Каталог недоступен.";
  }

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
        services={catalogServices}
        catalogError={catalogServicesError}
        slotBasePath={publicBookPaths.newSlot}
      />
    </PublicBookingShell>
  );
}
