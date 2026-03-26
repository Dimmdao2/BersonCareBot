/**
 * Адрес кабинета: iframe сайта клиники (EXEC I.9).
 */
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";

const ADDRESS_IFRAME_SRC = "https://dmitryberson.ru/adress";

export default async function PatientAddressPage() {
  const session = await getOptionalPatientSession();

  return (
    <AppShell
      title="Адрес кабинета"
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <iframe
          title="Адрес кабинета"
          src={ADDRESS_IFRAME_SRC}
          className="h-[calc(100dvh-9rem)] w-full shrink-0 rounded-lg border border-border bg-background sm:h-[calc(100dvh-8.5rem)]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </AppShell>
  );
}
