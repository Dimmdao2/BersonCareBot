import type { ReactNode } from 'react';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import styles from './StaffLoginShell.module.css';

type StaffLoginShellProps = {
  title: string;
  children: ReactNode;
};

/**
 * Staff (doctor/clinic) space's own login shell — the twin of [[AdminLoginShell]] for the
 * `/app/doctor/login` door. Same structure-only split: still wraps `PatientAppShell` internally so
 * the auth mechanics stay shared, but the clinic door owns its shell and icon treatment
 * independently of admin/patient.
 */
export function StaffLoginShell({ title, children }: StaffLoginShellProps) {
  return (
    <div className={styles.space}>
      <PatientAppShell
        title={title}
        user={null}
        patientHideHome
        patientHideRightIcons
        patientBrandTitleBar
        patientHideGatedHeader
        patientHideBottomNav
      >
        {children}
      </PatientAppShell>
    </div>
  );
}
