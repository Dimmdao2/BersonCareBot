'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useDoctorSupportUnreadCountPolling } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import { useDoctorPendingProgramTestsCount } from '@/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount';
import { useDoctorRegistrationSystemFailureCount } from '@/modules/auth/hooks/useDoctorRegistrationSystemFailureCount';

type DoctorShellBadgeCounts = {
  messagesUnread: number;
  pendingProgramTests: number;
  registrationSystemFailures: number;
};

const DoctorShellBadgeContext = createContext<DoctorShellBadgeCounts | undefined>(undefined);

/** Один polling непрочитанных сообщений врача на всё дерево кабинета (меню, виджеты дашборда). */
export function DoctorSupportUnreadProvider({
  children,
  enabled = true,
  registrationFailuresEnabled = false,
}: {
  children: ReactNode;
  enabled?: boolean;
  registrationFailuresEnabled?: boolean;
}) {
  const messagesUnread = useDoctorSupportUnreadCountPolling(enabled);
  const pendingProgramTests = useDoctorPendingProgramTestsCount(enabled);
  const registrationSystemFailures = useDoctorRegistrationSystemFailureCount(
    registrationFailuresEnabled,
  );

  return (
    <DoctorShellBadgeContext.Provider
      value={{ messagesUnread, pendingProgramTests, registrationSystemFailures }}
    >
      {children}
    </DoctorShellBadgeContext.Provider>
  );
}

export function useDoctorShellBadgeCounts(): DoctorShellBadgeCounts {
  const v = useContext(DoctorShellBadgeContext);
  if (v === undefined) {
    throw new Error('useDoctorShellBadgeCounts must be used within DoctorSupportUnreadProvider');
  }
  return v;
}

export function useDoctorSupportUnreadCount(): number {
  return useDoctorShellBadgeCounts().messagesUnread;
}
