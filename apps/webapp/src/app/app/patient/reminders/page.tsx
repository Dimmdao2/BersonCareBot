import { Suspense } from 'react';
import { requirePatientAccessWithPhone } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';
import { RemindersPageBody } from './RemindersPageBody';

export default async function RemindersPage() {
  const session = await requirePatientAccessWithPhone(routePaths.patientReminders);

  return (
    <PatientAppShell
      title="Расписание напоминаний"
      user={session.user}
      backHref={routePaths.profile}
      backLabel="Назад"
    >
      <Suspense fallback={<AppContentLoading className="py-10" />}>
        <RemindersPageBody session={session} />
      </Suspense>
    </PatientAppShell>
  );
}
