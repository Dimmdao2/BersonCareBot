'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListUnreadTextClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { DoctorPatientName } from '@/shared/ui/doctor/DoctorSupportStar';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { doctorInlineLinkClass, doctorPageStackClass } from '@/shared/ui/doctor/doctorVisual';
import { useIsMobileViewport } from '@/shared/ui/doctor/primitives/useIsMobileViewport';
import { formatDoctorFio } from '@/shared/lib/fio';
import { DoctorTodayLeftKpiRow } from './DoctorTodayLeftKpiRow';
import { DoctorTodayNextAppointment } from './DoctorTodayNextAppointment';
import { DoctorTodayQuickActions } from './DoctorTodayQuickActions';
import { DoctorTodayWeeklyAppointmentsChart } from './DoctorTodayWeeklyAppointmentsChart';
import { TodayMiniCalendarWithModal } from './TodayMiniCalendarWithModal';
import { DoctorStatCard } from './analytics/clients/DoctorStatCard';
import type { TodayDashboardData } from './loadDoctorTodayDashboard';
import { isCancelledAppointmentStatus } from '@/modules/booking-calendar/appointmentStatusLabels';
import { ON_SUPPORT_LIST_HREF, RECENT_VISITS_LIST_HREF } from './doctorTodayLinks';

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

function DoctorTodayPeopleSection({
  data,
  showHeader = true,
  flush = false,
  peopleListMode = data.peopleListMode,
  peopleCount = data.peopleCount,
  people = data.people,
  peopleListTruncated = data.peopleListTruncated,
}: {
  data: TodayDashboardData;
  showHeader?: boolean;
  flush?: boolean;
  peopleListMode?: TodayDashboardData['peopleListMode'];
  peopleCount?: number;
  people?: TodayDashboardData['people'];
  peopleListTruncated?: boolean;
}) {
  const peopleListIsOnSupport = peopleListMode === 'on_support';
  const peopleListTitle = peopleListIsOnSupport ? 'На сопровождении' : 'Недавние с визитами';

  return (
    <DoctorSection
      id="doctor-today-section-people"
      className={flush ? 'rounded-none border-0 bg-transparent p-0' : undefined}
    >
      {showHeader ? (
        <DoctorSectionHeader>
          <DoctorSectionTitle>{peopleListTitle}</DoctorSectionTitle>
          {peopleCount > 0 ? (
            <p className="text-xs text-muted-foreground" id="doctor-today-people-count">
              Клиентов: {peopleCount}
            </p>
          ) : null}
        </DoctorSectionHeader>
      ) : null}
      {peopleCount === 0 ? (
        <DoctorEmptyState>
          <p>
            {peopleListIsOnSupport ? 'Клиентов на сопровождении нет' : 'Клиентов с визитами нет'}
          </p>
          <Link
            href={peopleListIsOnSupport ? ON_SUPPORT_LIST_HREF : RECENT_VISITS_LIST_HREF}
            className={`${doctorInlineLinkClass} w-fit`}
          >
            Список клиентов
          </Link>
        </DoctorEmptyState>
      ) : (
        <>
          <DoctorDnaFlatList>
            {people.map((client, index) => {
              const attentionCount = client.unreadMessagesCount + client.newExerciseCommentsCount;
              const name = peopleItemName(client);
              return (
                <li key={client.userId}>
                  <Link
                    id={`doctor-today-person-${client.userId}`}
                    href={client.href}
                    aria-label={
                      attentionCount > 0
                        ? `${name}, новых сообщений и комментариев: ${attentionCount}`
                        : name
                    }
                    className={`${doctorDnaFlatListRowClass} ${doctorDnaFlatListClickableClass} justify-between gap-2${index === 0 ? ' border-t-0' : ''}`}
                  >
                    <DoctorPatientName
                      isOnSupport={client.isOnSupport}
                      className={`${doctorDnaFlatListPrimaryClass} min-w-0 truncate ${attentionCount > 0 ? doctorDnaFlatListUnreadTextClass : ''}`}
                      nameClassName="block"
                    >
                      {name}
                    </DoctorPatientName>
                    <DoctorAttentionBadge count={attentionCount} className="shrink-0" />
                  </Link>
                </li>
              );
            })}
          </DoctorDnaFlatList>
          {peopleListTruncated ? (
            <p>
              <Link
                href={peopleListIsOnSupport ? ON_SUPPORT_LIST_HREF : RECENT_VISITS_LIST_HREF}
                className={`${doctorInlineLinkClass} text-sm`}
                id="doctor-today-people-all"
              >
                {peopleListIsOnSupport ? 'Все на сопровождении' : 'Открыть клиентов'}
              </Link>
            </p>
          ) : null}
        </>
      )}
    </DoctorSection>
  );
}

function DoctorTodayAppointmentsList({
  appointments,
}: {
  appointments: TodayDashboardData['currentWeekAppointments'];
}) {
  return appointments.length === 0 ? (
    <DoctorEmptyState>Записей нет</DoctorEmptyState>
  ) : (
    <DoctorDnaFlatList>
      {appointments.map((appointment, index) => (
        <li key={appointment.id}>
          <Link
            href={appointment.href}
            className={`${doctorDnaFlatListRowClass} ${doctorDnaFlatListClickableClass} justify-between gap-3${index === 0 ? ' border-t-0' : ''}`}
          >
            <span className={`${doctorDnaFlatListPrimaryClass} min-w-0 truncate`}>
              {appointment.clientLabel}
            </span>
            <span className={`${doctorDnaFlatListMetaClass} shrink-0 tabular-nums`}>
              {appointment.time}
            </span>
          </Link>
        </li>
      ))}
    </DoctorDnaFlatList>
  );
}

export function DoctorTodayDashboard({
  data,
  displayIana,
  calendarSnapshot,
  specialistTasksAvailable,
  specialistTasksReadable,
}: Props) {
  const router = useRouter();
  const isMobile = useIsMobileViewport();
  const [mobileModal, setMobileModal] = useState<
    'support' | 'calendar' | 'week-appointments' | 'week-primary' | null
  >(null);
  const [taskOverrides, setTaskOverrides] = useState<Record<string, SpecialistTaskRow>>({});
  const [taskPatientNameOverrides, setTaskPatientNameOverrides] = useState<Record<string, string>>(
    {},
  );
  const [locallyCompletedTaskIds, setLocallyCompletedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [taskMutationPending, setTaskMutationPending] = useState(false);
  const tasks = useMemo(() => {
    const serverTaskIds = new Set(data.globalOpenTasks.map((task) => task.id));
    const visibleServerTasks = data.globalOpenTasks
      .filter((task) => !locallyCompletedTaskIds.has(task.id))
      .map((task) => taskOverrides[task.id] ?? task);
    const locallyCreatedTasks = Object.values(taskOverrides).filter(
      (task) => !serverTaskIds.has(task.id) && !locallyCompletedTaskIds.has(task.id),
    );
    return [...locallyCreatedTasks, ...visibleServerTasks];
  }, [data.globalOpenTasks, locallyCompletedTaskIds, taskOverrides]);
  const taskPatientNames = {
    ...data.globalTaskPatientNames,
    ...taskPatientNameOverrides,
  };

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const intervalId = window.setInterval(refresh, 10_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [router]);
  const currentWeek =
    data.weeklyTimeline.find((point) => point.isCurrent) ?? data.weeklyTimeline.at(-1);
  const activeTodayAppointments = data.todayAppointments.filter(
    (appointment) => !isCancelledAppointmentStatus(appointment.status),
  );

  const handleTaskSaved = (task: SpecialistTaskRow, patientDisplayName?: string) => {
    setTaskOverrides((current) => ({ ...current, [task.id]: task }));
    setLocallyCompletedTaskIds((current) => {
      if (!current.has(task.id)) return current;
      const next = new Set(current);
      next.delete(task.id);
      return next;
    });
    if (task.patientUserId && patientDisplayName?.trim()) {
      const patientUserId = task.patientUserId;
      setTaskPatientNameOverrides((current) => ({
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
      setLocallyCompletedTaskIds((current) => new Set(current).add(taskId));
      return true;
    } catch {
      return false;
    } finally {
      setTaskMutationPending(false);
    }
  };

  return (
    <div id="doctor-today-dashboard" className={`${doctorPageStackClass} min-h-0 flex-1`}>
      <DoctorPageHeader
        id="doctor-today-header"
        title="Сегодня"
        tabs={
          <DoctorTodayQuickActions
            todayIso={calendarSnapshot.todayIso}
            displayIana={displayIana}
            placement="header"
          />
        }
      />

      <div
        id="doctor-today-two-panes"
        className="doctor-today-two-pane-grid grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden md:items-stretch"
      >
        <div
          id="doctor-today-left-pane"
          className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden"
        >
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
            taskPatientOnSupport={data.globalTaskPatientOnSupport}
            tasksTotal={tasks.length}
            todayIso={calendarSnapshot.todayIso}
            displayIana={displayIana}
            tasksAvailable={specialistTasksAvailable}
            tasksReadable={specialistTasksReadable}
            taskMutationPending={taskMutationPending}
            onTaskComplete={handleTaskComplete}
            onTaskSaved={handleTaskSaved}
          />

          <DoctorTodayNextAppointment
            appointment={data.nextAppointment}
            displayIana={displayIana}
          />

          <DoctorMetricList columns="two" aria-label="Сводка дня">
            <DoctorStatCard
              id="doctor-today-mobile-kpi-support"
              title="Сопровождение"
              value={data.onSupportPeopleCount}
              onClick={data.onSupportPeopleCount > 0 ? () => setMobileModal('support') : undefined}
            />
            <DoctorStatCard
              id="doctor-today-mobile-kpi-appointments"
              title="Записей сегодня"
              value={activeTodayAppointments.length}
              onClick={
                isMobile && activeTodayAppointments.length > 0
                  ? () => setMobileModal('calendar')
                  : undefined
              }
            />
          </DoctorMetricList>

          <div className="doctor-today-mobile-chart min-h-0 flex-1">
            <DoctorTodayWeeklyAppointmentsChart points={data.weeklyTimeline} />
          </div>

          <DoctorMetricList
            columns="two"
            aria-label="Сводка недели"
            className="doctor-today-mobile-compact-fallback"
          >
            <DoctorStatCard
              id="doctor-today-mobile-kpi-week-appointments"
              title="Записей на неделе"
              value={currentWeek?.appointments ?? 0}
              onClick={
                data.currentWeekAppointments.length > 0
                  ? () => setMobileModal('week-appointments')
                  : undefined
              }
            />
            <DoctorStatCard
              id="doctor-today-mobile-kpi-week-new-clients"
              title="Первичных на неделе"
              value={currentWeek?.firstAppointments ?? 0}
              onClick={
                data.currentWeekFirstAppointments.length > 0
                  ? () => setMobileModal('week-primary')
                  : undefined
              }
            />
          </DoctorMetricList>
        </div>

        {!isMobile ? (
          <div
            id="doctor-today-right-pane"
            className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
          >
            <TodayMiniCalendarWithModal
              appointments={activeTodayAppointments}
              calendarSnapshot={calendarSnapshot}
              displayIana={displayIana}
              fillHeight
            />
          </div>
        ) : null}
      </div>

      <DoctorModal
        open={mobileModal === 'support'}
        onClose={() => setMobileModal(null)}
        title="Сопровождение"
        size="lg"
        bodyVariant="list"
        desktopPresentation="right-sheet"
      >
        <DoctorTodayPeopleSection
          data={data}
          showHeader={false}
          flush
          peopleListMode="on_support"
          peopleCount={data.onSupportPeopleCount}
          people={data.onSupportPeople}
          peopleListTruncated={data.onSupportPeopleListTruncated}
        />
      </DoctorModal>
      <DoctorModal
        open={mobileModal === 'calendar'}
        onClose={() => setMobileModal(null)}
        title="Записей сегодня"
        headerSubtitle={calendarSnapshot.todayDateLabel}
        size="content"
        bodyVariant="list"
      >
        <TodayMiniCalendarWithModal
          appointments={activeTodayAppointments}
          calendarSnapshot={calendarSnapshot}
          displayIana={displayIana}
          fillHeight
          flushChrome
        />
      </DoctorModal>
      <DoctorModal
        open={mobileModal === 'week-appointments' || mobileModal === 'week-primary'}
        onClose={() => setMobileModal(null)}
        title={mobileModal === 'week-primary' ? 'Первичные на неделе' : 'Записи на неделе'}
        size="lg"
        bodyVariant="list"
        desktopPresentation="right-sheet"
      >
        <DoctorTodayAppointmentsList
          appointments={
            mobileModal === 'week-primary'
              ? data.currentWeekFirstAppointments
              : data.currentWeekAppointments
          }
        />
      </DoctorModal>
    </div>
  );
}
