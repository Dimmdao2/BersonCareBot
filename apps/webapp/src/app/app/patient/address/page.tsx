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
          className="patient-address-iframe-height w-full shrink-0 rounded-lg border border-border bg-background"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </PatientAppShell>
  );
}
