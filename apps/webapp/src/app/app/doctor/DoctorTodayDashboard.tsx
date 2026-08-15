'use client';

import { CircleHelp, Dumbbell, MessageSquare } from 'lucide-react';
import Link from 'next/link';
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
import { DoctorGlobalTasksSection } from './DoctorGlobalTasksSection';
import { DoctorTodayLeftKpiRow } from './DoctorTodayLeftKpiRow';
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
  /**
   * Рабочие границы дня (§1.2, S4): вычислены на сервере через deriveWorkingBounds.
   * Прокидываются в мини-календарь как базовое окно рабочего дня.
   * `null` = день закрыт или scheduling недоступен → fallback по записям.
   */
  todayWorkingBounds?: { startMinute: number; endMinute: number } | null;
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
  todayWorkingBounds,
  specialistTasksAvailable,
  specialistTasksReadable,
}: Props) {
  const peopleListIsOnSupport = data.peopleListMode === 'on_support';
  const peopleListTitle = peopleListIsOnSupport ? 'На сопровождении' : 'Недавние с визитами';

  return (
    <div id="doctor-today-dashboard" className={doctorPageStackClass}>
      <DoctorPageHeader id="doctor-today-header" title="Сегодня" />

      <div id="doctor-today-two-panes" className="grid gap-3 md:grid-cols-2 md:items-start">
        <div id="doctor-today-left-pane" className="flex flex-col gap-3">
          <DoctorTodayLeftKpiRow
            pendingTestsTotal={data.pendingProgramTestsTotal}
            unreadConversations={data.unreadConversations}
            unreadTotal={data.unreadTotal}
            pendingProgramTests={data.pendingProgramTests}
            pendingProgramTestsTotal={data.pendingProgramTestsTotal}
            exerciseCommentAttentionItems={data.exerciseCommentAttentionItems}
            exerciseCommentAttentionTotal={data.exerciseCommentAttentionTotal}
            exerciseCommentAttentionTruncated={data.exerciseCommentAttentionTruncated}
          />

          <DoctorGlobalTasksSection
            initialTasks={data.globalOpenTasks}
            initialTasksTotal={data.globalOpenTasksTotal}
            todayIso={calendarSnapshot.todayIso}
            displayIana={displayIana}
            className="flex-1"
            available={specialistTasksAvailable}
            readable={specialistTasksReadable}
          />

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

        <div id="doctor-today-right-pane" className="flex flex-col gap-3">
          <TodayMiniCalendarWithModal
            appointments={data.todayAppointments}
            calendarSnapshot={calendarSnapshot}
            displayIana={displayIana}
            workingBounds={todayWorkingBounds}
          />
        </div>
      </div>
    </div>
  );
}
