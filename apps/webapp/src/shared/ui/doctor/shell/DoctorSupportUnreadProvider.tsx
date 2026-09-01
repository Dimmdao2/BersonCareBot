'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useDoctorSupportUnreadCountPolling } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import { useDoctorPendingProgramTestsCount } from '@/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount';
import { useDoctorRegistrationSystemFailureCount } from '@/modules/auth/hooks/useDoctorRegistrationSystemFailureCount';

type DoctorShellBadgeCounts = {
  messagesUnread: number;
  unreadExerciseComments: number;
  overdueTasks: number;
  pendingProgramTests: number;
  registrationSystemFailures: number;
};

const DoctorShellBadgeContext = createContext<DoctorShellBadgeCounts | undefined>(undefined);

/** Один polling непрочитанных сообщений врача на всё дерево кабинета (меню, виджеты дашборда). */
export function DoctorSupportUnreadProvider({
  children,
  enabled = true,
  registrationFailuresEnabled = false,
  initialAttention,
}: {
  children: ReactNode;
  enabled?: boolean;
  registrationFailuresEnabled?: boolean;
  initialAttention?: { unreadExerciseComments: boolean; overdueTasks: boolean };
}) {
  const messagesUnread = useDoctorSupportUnreadCountPolling(enabled);
  const pendingProgramTests = useDoctorPendingProgramTestsCount(enabled);
  const registrationSystemFailures = useDoctorRegistrationSystemFailureCount(
    registrationFailuresEnabled,
  );

  return (
    <DoctorShellBadgeContext.Provider
      value={{
        messagesUnread,
        unreadExerciseComments: initialAttention?.unreadExerciseComments ? 1 : 0,
        overdueTasks: initialAttention?.overdueTasks ? 1 : 0,
        pendingProgramTests,
        registrationSystemFailures,
      }}
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

export function useOptionalDoctorShellBadgeCounts(): DoctorShellBadgeCounts {
  return (
    useContext(DoctorShellBadgeContext) ?? {
      messagesUnread: 0,
      unreadExerciseComments: 0,
      overdueTasks: 0,
      pendingProgramTests: 0,
      registrationSystemFailures: 0,
    }
  );
}

export function useDoctorSupportUnreadCount(): number {
  return useDoctorShellBadgeCounts().messagesUnread;
}
