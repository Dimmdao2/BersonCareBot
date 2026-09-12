import Link from 'next/link';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientAccess } from '@/app-layer/guards/requireRole';
import { listHelpArticlesForPatient } from '@/modules/help-content/listHelpArticles';
import { getSupportContactUrl } from '@/modules/system-settings/supportContactUrl';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { PatientAppointmentWord } from '@/shared/ui/patient/organization/PatientAppointmentWord';
import { cn } from '@/lib/utils';
import {
  patientInlineLinkClass,
  patientBodyTextClass,
  patientSectionSurfaceClass,
} from '@/shared/ui/patient/patientVisual';
import { HelpSupportLink } from './HelpSupportLink';
import { PatientHelpArticleList } from './PatientHelpArticleList';

export const dynamic = 'force-dynamic';

export default async function PatientHelpPage() {
  const session = await requirePatientAccess(routePaths.patientHelp);
  const deps = buildAppDeps();
  const [supportUrl, articles] = await Promise.all([
    getSupportContactUrl(),
    listHelpArticlesForPatient(deps.contentPages),
  ]);

  return (
    <PatientAppShell
      title="Справка"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
    >
      <div id="patient-help-directory" className="flex flex-col gap-4">
        <PatientHelpArticleList articles={articles} />
        <section className={cn(patientSectionSurfaceClass, '!gap-3 !p-4')}>
          <ul className={cn(patientBodyTextClass, 'm-0 list-disc space-y-2 pl-5')}>
            <li>
              <Link
                href={routePaths.patientMessages}
                className={patientInlineLinkClass}
              >
                Сообщения и чат с поддержкой
              </Link>
            </li>
            <li>
              <Link href={routePaths.profile} className={patientInlineLinkClass}>
                Профиль и привязка контактов
              </Link>
            </li>
            <li>
              <Link href={routePaths.bookingNew} className={patientInlineLinkClass}>
                Запись на <PatientAppointmentWord form="appointmentAccusative" />
              </Link>
            </li>
          </ul>
          <HelpSupportLink href={supportUrl} />
        </section>
      </div>
    </PatientAppShell>
  );
}
