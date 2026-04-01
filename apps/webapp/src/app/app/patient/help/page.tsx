import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";

export default async function PatientHelpPage() {
  const session = await requirePatientAccess(routePaths.patientHelp);
  const supportUrl = await getSupportContactUrl();
  const supportHref = isSafeExternalHref(supportUrl) ? supportUrl : null;

  return (
    <AppShell title="Справка" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col gap-4">
        <h2 className="text-base font-semibold">Справка и поддержка</h2>
        <p className="text-sm text-muted-foreground">
          Ответы на частые вопросы появятся здесь; пока вы можете перейти в разделы ниже или написать в поддержку.
        </p>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm">
          <li>
            <Link href={routePaths.patientMessages} className="text-primary underline">
              Сообщения и чат с поддержкой
            </Link>
          </li>
          <li>
            <Link href={routePaths.profile} className="text-primary underline">
              Профиль и привязка контактов
            </Link>
          </li>
          <li>
            <Link href={routePaths.cabinet} className="text-primary underline">
              Запись на приём
            </Link>
          </li>
        </ul>
        {supportHref ? (
          <p className="text-sm">
            <a href={supportHref} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Написать в поддержку
            </a>
          </p>
        ) : null}
      </section>
    </AppShell>
  );
}
