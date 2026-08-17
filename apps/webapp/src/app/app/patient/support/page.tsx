import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { cn } from '@/lib/utils';
import {
  patientMutedTextClass,
  patientSectionSurfaceClass,
} from '@/shared/ui/patient/patientVisual';
import { PatientSupportForm } from './PatientSupportForm';

export default async function PatientSupportPage() {
  const session = await requirePatientAccess(routePaths.patientSupport);
  const deps = buildAppDeps();
  const verified = await deps.userByPhone.getVerifiedEmailForUser(session.user.userId);
  const defaultEmail = verified?.trim() ?? '';

  return (
    <PatientAppShell
      title="Поддержка"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
    >
      <section
        id="patient-support-form"
        className={cn(patientSectionSurfaceClass, '!gap-4 !p-6')}
      >
        <div>
          <h2 className="text-base font-semibold">Связаться с поддержкой</h2>
          <p className={cn(patientMutedTextClass, 'mt-1')}>
            Здесь помогают пользоваться приложением. Вопросы о здоровье, симптомах и лечении
            задавайте врачу в кабинете пациента.
          </p>
        </div>
        <PatientSupportForm defaultEmail={defaultEmail} />
      </section>
    </PatientAppShell>
  );
}
