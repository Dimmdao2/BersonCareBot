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
 * today's form styling is unchanged, but now lives in its own file/CSS module so the clinic space
 * can be themed and edited independently of admin/patient.
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
        patientHideBottomNav
      >
        {children}
      </PatientAppShell>
    </div>
  );
}
