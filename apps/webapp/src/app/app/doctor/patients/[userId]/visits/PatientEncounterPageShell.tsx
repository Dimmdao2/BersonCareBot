import type { ReactNode } from 'react';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { patientCardHref } from '../../patientCardHref';
import { PatientCardRouteTabs } from '../PatientCardSectionTabs';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';

export function PatientEncounterPageShell({
  userId,
  title,
  children,
  workspaceModules,
}: {
  userId: string;
  title: string;
  children: ReactNode;
  workspaceModules: WorkspaceModuleEffective;
}) {
  return (
    <DoctorAppShell
      title={title}
      backHref={patientCardHref(userId, { tab: 'karta' })}
      mobileBottomGutter
      mobileBottomTabs={
        <PatientCardRouteTabs
          userId={userId}
          variant="mobile"
          workspaceModules={workspaceModules}
        />
      }
    >
      <DoctorPageHeader
        id="doctor-patient-encounter-header"
        title={title}
        className="hidden md:flex"
        tabs={
          <PatientCardRouteTabs
            userId={userId}
            variant="desktop"
            workspaceModules={workspaceModules}
          />
        }
      />
      {children}
    </DoctorAppShell>
  );
}
