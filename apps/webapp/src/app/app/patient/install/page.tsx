import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function PatientInstallPage() {
  const session = await requirePatientAccess(routePaths.patientInstall);
  return (
    <AppShell title="Установить приложение" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-base font-semibold">Установка на устройство</h2>
        <p className="text-sm text-muted-foreground">
          Чтобы открывать кабинет как приложение, добавьте страницу на главный экран (PWA / «Добавить на экран Домой») в меню браузера.
        </p>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Chrome / Android: меню «⋯» → «Установить приложение» или «Добавить на главный экран».</li>
          <li>Safari / iOS: «Поделиться» → «На экран «Домой»».</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          После установки можно входить через Telegram (мини-приложение) или через браузер — тот же аккаунт.
        </p>
      </section>
    </AppShell>
  );
}
