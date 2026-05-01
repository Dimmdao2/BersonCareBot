import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";

export default async function PatientInstallPage() {
  const session = await requirePatientAccess(routePaths.patientInstall);
  return (
    <AppShell title="Установить приложение" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <section className={cn(patientSectionSurfaceClass, "!gap-4 !p-6")}>
        <h2 className="text-base font-semibold">Установка на устройство</h2>
        <p className={patientMutedTextClass}>
          Чтобы открывать кабинет как приложение, добавьте страницу на главный экран (PWA / «Добавить на экран Домой») в меню браузера.
        </p>
        <ul className={cn(patientMutedTextClass, "m-0 list-disc space-y-2 pl-5")}>
          <li>Chrome / Android: меню «⋯» → «Установить приложение» или «Добавить на главный экран».</li>
          <li>Safari / iOS: «Поделиться» → «На экран «Домой»».</li>
        </ul>
        <p className={patientMutedTextClass}>
          После установки можно входить через Telegram (мини-приложение) или через браузер — тот же аккаунт.
        </p>
      </section>
    </AppShell>
  );
}
