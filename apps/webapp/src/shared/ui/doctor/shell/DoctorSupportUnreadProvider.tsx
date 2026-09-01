'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
  const [navigationAttention, setNavigationAttention] = useState({
    unreadExerciseComments: 0,
    overdueTasks: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setNavigationAttention({ unreadExerciseComments: 0, overdueTasks: 0 });
      return;
    }

    const controller = new AbortController();
    void Promise.all([
      fetch('/api/doctor/exercise-comments?mode=unread&limit=1', {
        cache: 'no-store',
        signal: controller.signal,
      }),
      fetch('/api/doctor/tasks?limit=200', { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([commentsResponse, tasksResponse]) => {
        const commentsPayload: unknown = commentsResponse.ok ? await commentsResponse.json() : null;
        const tasksPayload: unknown = tasksResponse.ok ? await tasksResponse.json() : null;
        const unreadExerciseComments =
          commentsPayload !== null &&
          typeof commentsPayload === 'object' &&
          'items' in commentsPayload &&
          Array.isArray(commentsPayload.items) &&
          commentsPayload.items.length > 0;
        const tasks =
          tasksPayload !== null &&
          typeof tasksPayload === 'object' &&
          'tasks' in tasksPayload &&
          Array.isArray(tasksPayload.tasks)
            ? tasksPayload.tasks
            : [];
        const now = Date.now();
        const overdueTasks = tasks.some((task) => {
          if (task === null || typeof task !== 'object') return false;
          const dueAt = 'dueAt' in task && typeof task.dueAt === 'string' ? task.dueAt : null;
          const completedAt = 'completedAt' in task ? task.completedAt : null;
          if (!dueAt || completedAt) return false;
          const dueMs = Date.parse(dueAt);
          return !Number.isNaN(dueMs) && dueMs < now;
        });
        setNavigationAttention({
          unreadExerciseComments: unreadExerciseComments ? 1 : 0,
          overdueTasks: overdueTasks ? 1 : 0,
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setNavigationAttention({ unreadExerciseComments: 0, overdueTasks: 0 });
        }
      });

    return () => controller.abort();
  }, [enabled]);

  return (
    <DoctorShellBadgeContext.Provider
      value={{
        messagesUnread,
        unreadExerciseComments: navigationAttention.unreadExerciseComments,
        overdueTasks: navigationAttention.overdueTasks,
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
