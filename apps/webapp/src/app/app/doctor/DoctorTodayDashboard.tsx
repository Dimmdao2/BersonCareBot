import { CircleHelp, Dumbbell, MessageSquare } from "lucide-react";
import Link from "next/link";
import { DateTime } from "luxon";
import type { AdminRegistrationFailureAttention } from "@/app-layer/product-analytics/loadAdminRegistrationFailureAttention";
import type { AdminDoctorTodayHealthBanner } from "@/modules/operator-health/adminDoctorTodayHealthBanner";
import type { DoctorStatsState } from "@/modules/doctor-stats/service";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorInlineLinkClass, doctorPageStackClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorGlobalTasksSection } from "./DoctorGlobalTasksSection";
import { DoctorTodayLeftKpiRow } from "./DoctorTodayLeftKpiRow";
import { DoctorTodayRightKpiRow } from "./DoctorTodayRightKpiRow";
import { DoctorTodaySignalsSection } from "./DoctorTodaySignalsSection";
import { DoctorCurrentAppointmentCard } from "./DoctorCurrentAppointmentCard";
import { DoctorTodayMiniCalendar } from "./DoctorTodayMiniCalendar";
import {
  ON_SUPPORT_LIST_HREF,
  PROGRAM_WITHOUT_SUPPORT_LIST_HREF,
  type TodayDashboardData,
} from "./loadDoctorTodayDashboard";

type Props = {
  data: TodayDashboardData;
  kpiStats: DoctorStatsState;
  appointmentsTodayCount: number;
  monthAppointmentCount: number;
  displayIana: string;
  adminHealthBanner?: AdminDoctorTodayHealthBanner;
  adminRegistrationFailureBanner?: AdminRegistrationFailureAttention;
  showAnalyticsLink?: boolean;
};

export function DoctorTodayDashboard({
  data,
  kpiStats,
  appointmentsTodayCount,
  monthAppointmentCount,
  displayIana,
  adminHealthBanner,
  adminRegistrationFailureBanner,
  showAnalyticsLink,
}: Props) {
  // Вычисляем серверное время в бизнес-таймзоне для mini-calendar и карточки приёма
  const nowDt = DateTime.now().setZone(displayIana);
  const nowMinutes = nowDt.hour * 60 + nowDt.minute;
  const todayIso = nowDt.toISODate() ?? new Date().toISOString().slice(0, 10);
  const todayDateLabel = nowDt.setLocale("ru").toFormat("EEE, d MMMM");

  return (
    <div id="doctor-today-dashboard" className={doctorPageStackClass}>
      {/* Баннеры администратора */}
      {adminHealthBanner?.show ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <Link href={adminHealthBanner.href} className={`${doctorInlineLinkClass} font-medium`}>
            {adminHealthBanner.title}
          </Link>
        </div>
      ) : null}
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

      {/* Заголовок страницы */}
      <header
        id="doctor-today-header"
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
      >
        <h1 className="text-base font-semibold tracking-tight text-foreground">Сегодня</h1>
        {showAnalyticsLink ? (
          <Link
            id="doctor-today-link-stats"
            href="/app/doctor/analytics/clients"
            className={`${doctorInlineLinkClass} shrink-0 text-sm`}
          >
            Аналитика по клиентам
          </Link>
        ) : null}
      </header>

      {/* Двухколоночная раскладка: левое полотно | правое полотно */}
      <div
        id="doctor-today-two-panes"
        className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-start"
      >
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
            pendingProgramTestsTruncated={data.pendingProgramTestsTruncated}
            proactiveInsights={data.proactiveInsights}
            proactiveInsightsTotal={data.proactiveInsightsTotal}
            proactiveInsightsTruncated={data.proactiveInsightsTruncated}
            exerciseCommentAttentionItems={data.exerciseCommentAttentionItems}
            exerciseCommentAttentionTotal={data.exerciseCommentAttentionTotal}
            exerciseCommentAttentionTruncated={data.exerciseCommentAttentionTruncated}
          />

          {/* На сопровождении */}
          <DoctorSection id="doctor-today-section-on-support">
            <DoctorSectionHeader>
              <DoctorSectionTitle>На сопровождении</DoctorSectionTitle>
              {data.onSupportCount > 0 ? (
                <p className="text-xs text-muted-foreground" id="doctor-today-on-support-count">
                  Клиентов: {data.onSupportCount}
                </p>
              ) : null}
            </DoctorSectionHeader>
            {data.onSupportCount === 0 ? (
              <DoctorEmptyState>
                <p>Клиентов на сопровождении нет</p>
                <div className="flex flex-col gap-1">
                  <Link href={ON_SUPPORT_LIST_HREF} className={`${doctorInlineLinkClass} w-fit`}>
                    Список клиентов
                  </Link>
                  <Link
                    href={PROGRAM_WITHOUT_SUPPORT_LIST_HREF}
                    className={`${doctorInlineLinkClass} w-fit text-xs`}
                  >
                    Программа без сопровождения
                  </Link>
                </div>
              </DoctorEmptyState>
            ) : (
              <>
                <ul className="m-0 list-none space-y-2 p-0">
                  {data.onSupportClients.map((c) => (
                    <li
                      key={c.userId}
                      id={`doctor-today-on-support-${c.userId}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <Link href={c.href} className={`${doctorInlineLinkClass} min-w-0 font-medium`}>
                        <span className="truncate">{c.displayName}</span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
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
                    </li>
                  ))}
                </ul>
                <p className="flex flex-col gap-1">
                  {data.onSupportListTruncated ? (
                    <Link
                      href={ON_SUPPORT_LIST_HREF}
                      className={`${doctorInlineLinkClass} text-sm`}
                      id="doctor-today-on-support-all"
                    >
                      Все на сопровождении
                    </Link>
                  ) : null}
                  <Link
                    href={PROGRAM_WITHOUT_SUPPORT_LIST_HREF}
                    className={`${doctorInlineLinkClass} w-fit text-xs`}
                  >
                    Программа без сопровождения
                  </Link>
                </p>
              </>
            )}
          </DoctorSection>

          {/* Задачи (все открытые, сортировка по дедлайну) */}
          <DoctorGlobalTasksSection
            initialTasks={data.globalOpenTasks}
            todayIso={todayIso}
            className="flex-1"
          />

          {/* Сигналы пациентов */}
          <DoctorTodaySignalsSection
            proactiveInsights={data.proactiveInsights}
            proactiveInsightsTotal={data.proactiveInsightsTotal}
            proactiveInsightsTruncated={data.proactiveInsightsTruncated}
            newIntakeRequests={data.newIntakeRequests}
            unreadConversations={data.unreadConversations}
            unreadTotal={data.unreadTotal}
            pendingProgramTests={data.pendingProgramTests}
            pendingProgramTestsTotal={data.pendingProgramTestsTotal}
            pendingProgramTestsTruncated={data.pendingProgramTestsTruncated}
            exerciseCommentAttentionItems={data.exerciseCommentAttentionItems}
            exerciseCommentAttentionTotal={data.exerciseCommentAttentionTotal}
            exerciseCommentAttentionTruncated={data.exerciseCommentAttentionTruncated}
          />
        </div>

        {/* ───── Правое полотно: приём и время ───── */}
        <div id="doctor-today-right-pane" className="flex flex-col gap-3">
          {/* 3 KPI: Сегодня, Неделя, Месяц */}
          <DoctorTodayRightKpiRow
            appointmentsTodayCount={appointmentsTodayCount}
            weekAppointmentsCount={kpiStats.appointments.total}
            monthAppointmentCount={monthAppointmentCount}
          />

          {/* Сейчас на приёме / следующая запись */}
          <DoctorCurrentAppointmentCard
            appointments={data.todayAppointments}
            nowMinutes={nowMinutes}
          />

          {/* Мини-календарь — расписание на сегодня */}
          <DoctorTodayMiniCalendar
            appointments={data.todayAppointments}
            nowMinutes={nowMinutes}
            todayDateLabel={todayDateLabel}
            displayIana={displayIana}
          />
        </div>
      </div>
    </div>
  );
}
