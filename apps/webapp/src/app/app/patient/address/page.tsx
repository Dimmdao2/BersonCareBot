/**
 * Адрес кабинета: iframe сайта специалиста (EXEC I.9).
 */
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";

const ADDRESS_IFRAME_SRC = "https://dmitryberson.ru/adress";

export default async function PatientAddressPage() {
  const session = await getOptionalPatientSession();

  return (
    <PatientAppShell
      title="Адрес кабинета"
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
     
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <iframe
          title="Адрес кабинета"
          src={ADDRESS_IFRAME_SRC}
          className="h-[calc(100dvh_-_var(--patient-header-bar-height,var(--patient-header-bar-chrome-fallback))_-_var(--patient-header-fade-height,0.5rem)_-_var(--patient-bottom-nav-height,var(--patient-bottom-nav-chrome-fallback))_-_2rem)] w-full shrink-0 rounded-lg border border-border bg-background max-patient-desktop:h-[calc(100dvh_-_var(--patient-header-bar-height,var(--patient-header-bar-chrome-fallback))_-_var(--patient-header-fade-height,0.5rem)_-_3rem)]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </PatientAppShell>
  );
}
