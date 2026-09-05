'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useDoctorSupportUnreadCountPolling } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import { useDoctorPendingProgramTestsCount } from '@/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount';
import { useDoctorRegistrationSystemFailureCount } from '@/modules/auth/hooks/useDoctorRegistrationSystemFailureCount';
import {
  DOCTOR_EXERCISE_COMMENTS_CHANGED_EVENT,
  DOCTOR_TASKS_CHANGED_EVENT,
} from './doctorShellBadgeEvents';

type DoctorShellBadgeCounts = {
  messagesUnread: number;
  unreadExerciseComments: number;
  overdueTasks: number;
  pendingProgramTests: number;
  registrationSystemFailures: number;
  messagesUnreadReady: boolean;
  unreadExerciseCommentsReady: boolean;
  overdueTasksReady: boolean;
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
  const messages = useDoctorSupportUnreadCountPolling(enabled);
  const pendingProgramTests = useDoctorPendingProgramTestsCount(enabled);
  const registrationSystemFailures = useDoctorRegistrationSystemFailureCount(
    registrationFailuresEnabled,
  );
  const [navigationAttention, setNavigationAttention] = useState({
    unreadExerciseComments: 0,
    overdueTasks: 0,
    unreadExerciseCommentsReady: false,
    overdueTasksReady: false,
  });
  const [nextTaskDueAt, setNextTaskDueAt] = useState<number | null>(null);

  const refreshExerciseComments = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/doctor/comments/patients?mode=unread', {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return;
    const payload: unknown = await response.json();
    const patients =
      payload !== null &&
      typeof payload === 'object' &&
      'patients' in payload &&
      Array.isArray(payload.patients)
        ? payload.patients
        : [];
    const unreadExerciseComments = patients.reduce((sum, patient) => {
      if (patient === null || typeof patient !== 'object') return sum;
      const unreadCount =
        'unreadCount' in patient && typeof patient.unreadCount === 'number'
          ? patient.unreadCount
          : 0;
      return sum + Math.max(0, unreadCount);
    }, 0);
    setNavigationAttention((current) => ({
      ...current,
      unreadExerciseComments,
      unreadExerciseCommentsReady: true,
    }));
  }, []);

  const refreshTasks = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/doctor/tasks?limit=200', { cache: 'no-store', signal });
    if (!response.ok) return;
    const payload: unknown = await response.json();
    const tasks =
      payload !== null &&
      typeof payload === 'object' &&
      'tasks' in payload &&
      Array.isArray(payload.tasks)
        ? payload.tasks
        : [];
    const now = Date.now();
    let nearestFutureDueAt: number | null = null;
    const overdueTasks = tasks.reduce((count, task) => {
      if (task === null || typeof task !== 'object') return count;
      const dueAt = 'dueAt' in task && typeof task.dueAt === 'string' ? task.dueAt : null;
      const completedAt = 'completedAt' in task ? task.completedAt : null;
      if (!dueAt || completedAt) return count;
      const dueMs = Date.parse(dueAt);
      if (Number.isNaN(dueMs)) return count;
      if (dueMs < now) return count + 1;
      if (nearestFutureDueAt === null || dueMs < nearestFutureDueAt) nearestFutureDueAt = dueMs;
      return count;
    }, 0);
    setNextTaskDueAt(nearestFutureDueAt);
    setNavigationAttention((current) => ({
      ...current,
      overdueTasks,
      overdueTasksReady: true,
    }));
  }, []);

  useEffect(() => {
    if (!enabled || nextTaskDueAt === null) return;
    const delay = Math.min(Math.max(0, nextTaskDueAt - Date.now() + 100), 2_147_483_647);
    const timeoutId = window.setTimeout(() => {
      if (document.visibilityState === 'visible') void refreshTasks().catch(() => {});
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [enabled, nextTaskDueAt, refreshTasks]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const refreshVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshExerciseComments(controller.signal).catch(() => {});
      void refreshTasks(controller.signal).catch(() => {});
    };
    const refreshComments = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshExerciseComments(controller.signal).catch(() => {});
    };
    const refreshTaskAttention = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshTasks(controller.signal).catch(() => {});
    };

    refreshVisible();
    const intervalId = window.setInterval(refreshVisible, 20_000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    window.addEventListener(DOCTOR_EXERCISE_COMMENTS_CHANGED_EVENT, refreshComments);
    window.addEventListener(DOCTOR_TASKS_CHANGED_EVENT, refreshTaskAttention);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener(DOCTOR_EXERCISE_COMMENTS_CHANGED_EVENT, refreshComments);
      window.removeEventListener(DOCTOR_TASKS_CHANGED_EVENT, refreshTaskAttention);
    };
  }, [enabled, refreshExerciseComments, refreshTasks]);

  return (
    <DoctorShellBadgeContext.Provider
      value={{
        messagesUnread: enabled ? messages.count : 0,
        unreadExerciseComments: enabled ? navigationAttention.unreadExerciseComments : 0,
        overdueTasks: enabled ? navigationAttention.overdueTasks : 0,
        pendingProgramTests,
        registrationSystemFailures,
        messagesUnreadReady: messages.ready,
        unreadExerciseCommentsReady:
          enabled && navigationAttention.unreadExerciseCommentsReady,
        overdueTasksReady: enabled && navigationAttention.overdueTasksReady,
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
      messagesUnreadReady: false,
      unreadExerciseCommentsReady: false,
      overdueTasksReady: false,
    }
  );
}

export function useDoctorSupportUnreadCount(): number {
  return useDoctorShellBadgeCounts().messagesUnread;
}
