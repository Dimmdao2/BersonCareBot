import Link from "next/link";
import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { getSupportContactUrl } from "@/modules/system-settings/supportContactUrl";
import { cn } from "@/lib/utils";
import { patientInlineLinkClass, patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";
import { HelpSupportLink } from "./HelpSupportLink";

export default async function PatientHelpPage() {
  const session = await requirePatientAccess(routePaths.patientHelp);
  const supportUrl = await getSupportContactUrl();

  return (
    <AppShell title="Справка" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <section className={cn(patientSectionSurfaceClass, "!gap-4 !p-6")}>
        <h2 className="text-base font-semibold">Справка и поддержка</h2>
        <p className={patientMutedTextClass}>
          Ответы на частые вопросы появятся здесь; пока вы можете перейти в разделы ниже или написать в поддержку.
        </p>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm">
          <li>
            <Link href={routePaths.patientMessages} className={cn(patientInlineLinkClass, "text-sm")}>
              Сообщения и чат с поддержкой
            </Link>
          </li>
          <li>
            <Link href={routePaths.profile} className={cn(patientInlineLinkClass, "text-sm")}>
              Профиль и привязка контактов
            </Link>
          </li>
          <li>
            <Link href={routePaths.bookingNew} className={cn(patientInlineLinkClass, "text-sm")}>
              Запись на приём
            </Link>
          </li>
        </ul>
        <HelpSupportLink href={supportUrl} />
      </section>
    </AppShell>
  );
}
