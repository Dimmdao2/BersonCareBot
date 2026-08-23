'use client';

import { CircleHelp, Dumbbell, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { doctorInlineLinkClass, doctorPageStackClass } from '@/shared/ui/doctor/doctorVisual';
import { formatDoctorFio } from '@/shared/lib/fio';
import { DoctorTodayLeftKpiRow } from './DoctorTodayLeftKpiRow';
import { DoctorTodayNextAppointment } from './DoctorTodayNextAppointment';
import { TodayMiniCalendarWithModal } from './TodayMiniCalendarWithModal';
import type { TodayDashboardData } from './loadDoctorTodayDashboard';
import {
  ON_SUPPORT_LIST_HREF,
  PROGRAM_WITHOUT_SUPPORT_LIST_HREF,
  RECENT_VISITS_LIST_HREF,
} from './doctorTodayLinks';

export type DoctorTodayCalendarSnapshot = {
  todayIso: string;
  nowMinutes: number;
  todayDateLabel: string;
};

type Props = {
  data: TodayDashboardData;
  displayIana: string;
  /** Fixed on the RSC render so the SSR shell and browser hydrate the same calendar day. */
  calendarSnapshot: DoctorTodayCalendarSnapshot;
  specialistTasksAvailable: boolean;
  specialistTasksReadable: boolean;
  calendarDefaultWindow?: { startMinute: number; endMinute: number };
};

function peopleItemName(client: TodayDashboardData['people'][number]): string {
  return formatDoctorFio(
    {
      lastName: client.lastName ?? null,
      firstName: client.firstName ?? null,
      patronymic: client.patronymic ?? null,
    },
    client.displayName.trim() || '—',
  );
}

export function DoctorTodayDashboard({
  data,
  displayIana,
  calendarSnapshot,
  calendarDefaultWindow,
  specialistTasksAvailable,
  specialistTasksReadable,
}: Props) {
  const peopleListIsOnSupport = data.peopleListMode === 'on_support';
  const peopleListTitle = peopleListIsOnSupport ? 'На сопровождении' : 'Недавние с визитами';
  const [tasks, setTasks] = useState(data.globalOpenTasks);
  const [taskPatientNames, setTaskPatientNames] = useState(data.globalTaskPatientNames);
  const [taskMutationPending, setTaskMutationPending] = useState(false);

  const handleTaskSaved = (task: SpecialistTaskRow, patientDisplayName?: string) => {
    setTasks((current) => {
      const exists = current.some((item) => item.id === task.id);
      return exists
        ? current.map((item) => (item.id === task.id ? task : item))
        : [task, ...current];
    });
    if (task.patientUserId && patientDisplayName?.trim()) {
      const patientUserId = task.patientUserId;
      setTaskPatientNames((current) => ({
        ...current,
        [patientUserId]: patientDisplayName.trim(),
      }));
    }
  };

  const handleTaskComplete = async (taskId: string): Promise<boolean> => {
    setTaskMutationPending(true);
    try {
      const response = await fetch(`/api/doctor/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST',
      });
      if (!response.ok) return false;
      setTasks((current) => current.filter((task) => task.id !== taskId));
      return true;
    } catch {
      return false;
    } finally {
      setTaskMutationPending(false);
    }
  };

  return (
    <div id="doctor-today-dashboard" className={doctorPageStackClass}>
      <DoctorPageHeader id="doctor-today-header" title="Сегодня" />

      <div
        id="doctor-today-two-panes"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start"
      >
        <div id="doctor-today-left-pane" className="flex min-w-0 flex-col gap-3">
          <DoctorTodayLeftKpiRow
            pendingTestsTotal={data.pendingProgramTestsTotal}
            unreadConversations={data.unreadConversations}
            unreadTotal={data.unreadTotal}
            pendingProgramTests={data.pendingProgramTests}
            pendingProgramTestsTotal={data.pendingProgramTestsTotal}
            exerciseCommentAttentionItems={data.exerciseCommentAttentionItems}
            exerciseCommentAttentionTotal={data.exerciseCommentAttentionTotal}
            exerciseCommentAttentionTruncated={data.exerciseCommentAttentionTruncated}
            tasks={tasks}
            taskPatientNames={taskPatientNames}
            tasksTotal={tasks.length}
            todayIso={calendarSnapshot.todayIso}
            displayIana={displayIana}
            tasksAvailable={specialistTasksAvailable}
            tasksReadable={specialistTasksReadable}
            taskMutationPending={taskMutationPending}
            onTaskComplete={handleTaskComplete}
            onTaskSaved={handleTaskSaved}
          />

          <DoctorTodayNextAppointment appointment={data.nextAppointment} />

          <DoctorSection id="doctor-today-section-people">
            <DoctorSectionHeader>
              <DoctorSectionTitle>{peopleListTitle}</DoctorSectionTitle>
              {data.peopleCount > 0 ? (
                <p className="text-xs text-muted-foreground" id="doctor-today-people-count">
                  Клиентов: {data.peopleCount}
                </p>
              ) : null}
            </DoctorSectionHeader>
            {data.peopleCount === 0 ? (
              <DoctorEmptyState>
                <p>
                  {peopleListIsOnSupport
                    ? 'Клиентов на сопровождении нет'
                    : 'Клиентов с визитами нет'}
                </p>
                <div className="flex flex-col gap-1">
                  <Link
                    href={peopleListIsOnSupport ? ON_SUPPORT_LIST_HREF : RECENT_VISITS_LIST_HREF}
                    className={`${doctorInlineLinkClass} w-fit`}
                  >
                    Список клиентов
                  </Link>
                  {peopleListIsOnSupport ? (
                    <Link
                      href={PROGRAM_WITHOUT_SUPPORT_LIST_HREF}
                      className={`${doctorInlineLinkClass} w-fit text-xs`}
                    >
                      Программа без сопровождения
                    </Link>
                  ) : null}
                </div>
              </DoctorEmptyState>
            ) : (
              <>
                <ul className={doctorDnaFlatListClass}>
                  {data.people.map((c, index) => (
                    <li key={c.userId}>
                      <Link
                        id={`doctor-today-person-${c.userId}`}
                        href={c.href}
                        aria-label={peopleItemName(c)}
                        className={`${doctorDnaFlatListRowClass} ${doctorDnaFlatListClickableClass} justify-between gap-2${index === 0 ? ' border-t-0' : ''}`}
                      >
                        <span className={`${doctorDnaFlatListPrimaryClass} min-w-0 truncate`}>
                          <span className="block truncate">{peopleItemName(c)}</span>
                        </span>
                        <div
                          className={`ml-auto flex shrink-0 items-center gap-2 ${doctorDnaFlatListMetaClass}`}
                        >
                          <span
                            className="inline-flex items-center gap-1"
                            title="Новые сообщения"
                            aria-label={`Новые сообщения: ${c.unreadMessagesCount}`}
                          >
                            <MessageSquare className="size-3.5" aria-hidden />
                            {c.unreadMessagesCount > 0 ? (
                              <span className="tabular-nums">{c.unreadMessagesCount}</span>
                            ) : null}
                          </span>
                          <span
                            className="inline-flex items-center gap-1"
                            title="Отметки упражнений за сегодня"
                            aria-label={`Отметки упражнений за сегодня: ${c.exerciseDoneTodayCount}`}
                          >
                            <Dumbbell className="size-3.5" aria-hidden />
                            {c.exerciseDoneTodayCount > 0 ? (
                              <span className="tabular-nums">{c.exerciseDoneTodayCount}</span>
                            ) : null}
                          </span>
                          <span
                            className="inline-flex items-center gap-1"
                            title="Новые комментарии по упражнениям"
                            aria-label={`Новые комментарии по упражнениям: ${c.newExerciseCommentsCount}`}
                          >
                            <span className="inline-flex size-4 items-center justify-center rounded-full border border-border/70">
                              <CircleHelp className="size-3" aria-hidden />
                            </span>
                            {c.newExerciseCommentsCount > 0 ? (
                              <span className="tabular-nums">{c.newExerciseCommentsCount}</span>
                            ) : null}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="flex flex-col gap-1">
                  {data.peopleListTruncated ? (
                    <Link
                      href={peopleListIsOnSupport ? ON_SUPPORT_LIST_HREF : RECENT_VISITS_LIST_HREF}
                      className={`${doctorInlineLinkClass} text-sm`}
                      id="doctor-today-people-all"
                    >
                      {peopleListIsOnSupport ? 'Все на сопровождении' : 'Открыть клиентов'}
                    </Link>
                  ) : null}
                  {peopleListIsOnSupport ? (
                    <Link
                      href={PROGRAM_WITHOUT_SUPPORT_LIST_HREF}
                      className={`${doctorInlineLinkClass} w-fit text-xs`}
                    >
                      Программа без сопровождения
                    </Link>
                  ) : null}
                </p>
              </>
            )}
          </DoctorSection>
        </div>

        <div id="doctor-today-right-pane" className="flex min-w-0 flex-col gap-3">
          <TodayMiniCalendarWithModal
            appointments={data.todayAppointments}
            calendarSnapshot={calendarSnapshot}
            displayIana={displayIana}
            defaultWindow={calendarDefaultWindow}
          />
        </div>
      </div>
    </div>
  );
}
