import type { ReactNode } from 'react';
import { PatientAppShell } from '@/shared/ui/patient/PatientAppShell';
import styles from './AdminLoginShell.module.css';

type AdminLoginShellProps = {
  title: string;
  children: ReactNode;
};

/**
 * Admin space's own login shell. Split out of `AppEntryRsc`'s generic non-TherapyGo branch, which
 * used to hand admin, doctor and non-browser patient miniapp entries the exact same `PatientAppShell`
 * call — the "one screen, three modes" the owner named 12.09. Structure-only pass: still renders
 * through `PatientAppShell` internally (so the shared patient-primitive form controls AuthFlowV2/
 * AppEntryLoginContent use keep today's styling unchanged, zero visual regression), but now lives
 * in its own file/CSS module so admin can be themed and edited independently of staff/patient —
 * see [[StaffLoginShell]] for the doctor-portal twin.
 */
export function AdminLoginShell({ title, children }: AdminLoginShellProps) {
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
