'use client';

import { useMemo } from 'react';
import type { DoctorMenuBadgeKey, DoctorMenuLinkItem } from '@/shared/ui/doctor/doctorNavLinks';
import { useOptionalDoctorMedicalMergeConflictCount } from '@/shared/ui/doctor/DoctorMedicalMergeConflictProvider';
import { useOptionalDoctorShellBadgeCounts } from '@/shared/ui/doctor/shell/DoctorSupportUnreadProvider';
import {
  resolveSpecialistTaskAttentionTone,
  type SpecialistTaskAttentionTone,
} from '@/modules/specialist-tasks/taskPriority';

export type TaskAttentionTone = Exclude<SpecialistTaskAttentionTone, null>;

/**
 * Отметки пунктов меню считаются ОДИН раз и для всех навигаций сразу.
 *
 * До 15.09.2026 боковое меню считало их по `badgeKey` пункта, а нижняя навигация — своей цепочкой
 * `if (item.id === …)`, знавшей только про сообщения и задачи. Поэтому красная точка конфликта
 * учётных записей, которую канон требует у пункта «Клиенты» («красная точка, как у сообщений»,
 * `AUTH_AND_IDENTITY_CANON.md` §18б), на мобильной ширине не появлялась вовсе: пункт её просто не
 * рассматривал. Живая приёмка Э4c это и увидела. Пока источник один, новый `badgeKey` доезжает до
 * обеих навигаций сам.
 */
export function useDoctorNavBadgeCounts(): {
  badgeCounts: Record<DoctorMenuBadgeKey, number>;
  taskAttentionTone: TaskAttentionTone;
} {
  const {
    messagesUnread,
    unreadExerciseComments,
    overdueTasks,
    todayTasks,
    pendingProgramTests,
    registrationSystemFailures,
  } = useOptionalDoctorShellBadgeCounts();
  const medicalMergeConflicts = useOptionalDoctorMedicalMergeConflictCount();

  const badgeCounts = useMemo(
    () =>
      ({
        messagesUnread,
        registrationSystemFailures,
        pendingProgramTests,
        todayAttention: pendingProgramTests,
        communicationsTotal: messagesUnread + unreadExerciseComments,
        overdueTasks: overdueTasks > 0 ? overdueTasks : todayTasks,
        medicalMergeConflicts,
      }) satisfies Record<DoctorMenuBadgeKey, number>,
    [
      messagesUnread,
      unreadExerciseComments,
      overdueTasks,
      todayTasks,
      registrationSystemFailures,
      pendingProgramTests,
      medicalMergeConflicts,
    ],
  );
  const taskAttentionTone = resolveSpecialistTaskAttentionTone(overdueTasks, todayTasks) ?? 'primary';

  return { badgeCounts, taskAttentionTone };
}

/** Точкой показываются отметки без числа: их смысл — «есть», а не «сколько». */
export function isDotBadge(badgeKey: DoctorMenuBadgeKey): boolean {
  return (
    badgeKey === 'communicationsTotal' ||
    badgeKey === 'overdueTasks' ||
    badgeKey === 'medicalMergeConflicts'
  );
}

/** Красная точка — для того, что сломано или ждёт разбора; остальное не кричит. */
export function badgeTone(
  badgeKey: DoctorMenuBadgeKey,
  taskAttentionTone: TaskAttentionTone,
): TaskAttentionTone {
  return badgeKey === 'overdueTasks' ? taskAttentionTone : 'danger';
}

/**
 * Подпись ссылки, когда у пункта горит отметка. Скринридер обязан услышать то же, что глаз видит
 * точкой, — иначе отметка есть только для зрячего.
 */
export function linkAriaLabelWhenBadged(
  item: Pick<DoctorMenuLinkItem, 'label' | 'badgeKey'>,
  formatted: string,
  taskAttentionTone: TaskAttentionTone,
): string | undefined {
  if (!item.badgeKey || !formatted) return undefined;
  if (item.badgeKey === 'registrationSystemFailures')
    return `${item.label}. Сбоев регистрации: ${formatted}.`;
  if (item.badgeKey === 'pendingProgramTests') return `${item.label}. К проверке: ${formatted}.`;
  if (item.badgeKey === 'todayAttention') return `${item.label}. Требует внимания: ${formatted}.`;
  if (item.badgeKey === 'communicationsTotal') return `${item.label}. Есть непрочитанные.`;
  if (item.badgeKey === 'medicalMergeConflicts') {
    return `${item.label}. Есть конфликт учётных записей клиента.`;
  }
  if (item.badgeKey === 'overdueTasks') {
    return taskAttentionTone === 'danger'
      ? `${item.label}. Есть просроченные задачи.`
      : `${item.label}. Есть задачи на сегодня.`;
  }
  return `${item.label}. Непрочитанных сообщений: ${formatted}.`;
}
