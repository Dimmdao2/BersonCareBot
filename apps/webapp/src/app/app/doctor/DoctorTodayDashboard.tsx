'use client';

import { CircleHelp, Dumbbell, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import type { AdminRegistrationFailureAttention } from '@/app-layer/product-analytics/loadAdminRegistrationFailureAttention';
import type { AdminDoctorTodayHealthBanner } from '@/modules/operator-health/adminDoctorTodayHealthBanner';
import type { DoctorStatsState } from '@/modules/doctor-stats/service';
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

type Props = {
  data: TodayDashboardData;
  kpiStats: DoctorStatsState;
  appointmentsTodayCount: number;
  /** #9: explicit week count so it equals the modal list length (includes cancelled). */
  weekAppointmentsCount?: number;
  monthAppointmentCount: number;
  displayIana: string;
  adminHealthBanner?: AdminDoctorTodayHealthBanner;
  adminRegistrationFailureBanner?: AdminRegistrationFailureAttention;
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
  adminHealthBanner,
  adminRegistrationFailureBanner,
  todayWorkingBounds,
}: Props) {
  // Вычисляем серверное время в бизнес-таймзоне для mini-calendar и карточки приёма
  const nowDt = DateTime.now().setZone(displayIana);
  const nowMinutes = nowDt.hour * 60 + nowDt.minute;
  const todayIso = nowDt.toISODate() ?? new Date().toISOString().slice(0, 10);
  const todayDateLabel = nowDt.setLocale('ru').toFormat('EEE, d MMMM');
  const peopleListIsOnSupport = data.peopleListMode === 'on_support';
  const peopleListTitle = peopleListIsOnSupport ? 'На сопровождении' : 'Недавние с визитами';

  return (
    <div id="doctor-today-dashboard" className={doctorPageStackClass}>
      {/* Per-page шапка (S1/D2): заголовок + важное (здоровье системы) + ссылка на аналитику */}
      <DoctorPageHeader
        id="doctor-today-header"
        title="Сегодня"
        info={
          adminHealthBanner?.show ? (
            <Link
              id="doctor-today-health-attention"
              href={adminHealthBanner.href}
              className={
                adminHealthBanner.tone === 'stop'
                  ? 'inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive no-underline hover:bg-destructive/15'
                  : 'inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-900 no-underline hover:bg-amber-500/15 dark:text-amber-100'
              }
            >
              {adminHealthBanner.title}
            </Link>
          ) : undefined
        }
      />

      {/* Баннер сбоя регистрации — остаётся отдельным блоком под шапкой */}
      {adminRegistrationFailureBanner?.show ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <Link
            href={adminRegistrationFailureBanner.href}
            className={`${doctorInlineLinkClass} font-medium`}
          >
            {adminRegistrationFailureBanner.title}
          </Link>
        </div>
      ) : null}

      {/* Двухколоночная раскладка: левое полотно | правое полотно */}
      <div id="doctor-today-two-panes" className="grid gap-3 md:grid-cols-2 md:items-start">
        {/* ───── Левое полотно: входящий рабочий поток ───── */}
        <div id="doctor-today-left-pane" className="flex flex-col gap-3">
          {/* 4 компактных KPI: Сообщения, Комментарии, Заявки, Тесты */}
          <DoctorTodayLeftKpiRow
            intakeCount={data.newIntakeRequests.length}
            pendingTestsTotal={data.pendingProgramTestsTotal}
            newIntakeRequests={data.newIntakeRequests}
            unreadConversations={data.unreadConversations}
            unreadTotal={data.unreadTotal}
            pendingProgramTests={data.pendingProgramTests}
            pendingProgramTestsTotal={data.pendingProgramTestsTotal}
            exerciseCommentAttentionItems={data.exerciseCommentAttentionItems}
            exerciseCommentAttentionTotal={data.exerciseCommentAttentionTotal}
            exerciseCommentAttentionTruncated={data.exerciseCommentAttentionTruncated}
          />

          {/* §1.3: Задачи — поднять над «На сопровождении» */}
          <DoctorGlobalTasksSection
            initialTasks={data.globalOpenTasks}
            initialTasksTotal={data.globalOpenTasksTotal}
            todayIso={todayIso}
            displayIana={displayIana}
            className="flex-1"
          />

          {/* Configurable people list: exact on-support or recent-visit semantics. */}
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

          {/* Owner punch-list (2026-07-25) item 2: the «Сигналы пациентов» card is removed —
              it was unclear to the owner. The underlying signal mechanism (doctor-proactive-insights,
              data.proactiveInsights) is kept and now surfaces as an attention mark + reason tooltip
              on the patient's row in the support/messages list instead
              (see DoctorSupportInbox.tsx). DoctorTodaySignalsSection.tsx is left in the tree unused
              in case the owner wants a variant of it back later. */}
        </div>

        {/* ───── Правое полотно: приём и время ───── */}
        <div id="doctor-today-right-pane" className="flex flex-col gap-3">
          {/* Owner-deferred: appointment KPI row is intentionally not rendered;
              DoctorTodayRightKpiRow remains intact for a later product decision. */}

          {/* §1.1: Мини-календарь — первое содержимое правой колонки. */}
          <TodayMiniCalendarWithModal
            appointments={data.todayAppointments}
            nowMinutes={nowMinutes}
            todayDateLabel={todayDateLabel}
            displayIana={displayIana}
            workingBounds={todayWorkingBounds}
          />
        </div>
      </div>
    </div>
  );
}
