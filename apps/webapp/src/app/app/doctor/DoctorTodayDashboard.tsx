import { CircleHelp, Dumbbell, MessageSquare } from "lucide-react";
import Link from "next/link";
import { DateTime } from "luxon";
import type { AdminRegistrationFailureAttention } from "@/app-layer/product-analytics/loadAdminRegistrationFailureAttention";
import type { AdminDoctorTodayHealthBanner } from "@/modules/operator-health/adminDoctorTodayHealthBanner";
import type { DoctorStatsState } from "@/modules/doctor-stats/service";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { doctorInlineLinkClass, doctorPageStackClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorGlobalTasksSection } from "./DoctorGlobalTasksSection";
import { DoctorTodayLeftKpiRow } from "./DoctorTodayLeftKpiRow";
import { DoctorTodayRightKpiRow } from "./DoctorTodayRightKpiRow";
import { DoctorTodaySignalsSection } from "./DoctorTodaySignalsSection";
import { TodayMiniCalendarWithModal } from "./TodayMiniCalendarWithModal";
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
  /**
   * Рабочие границы дня (§1.2, S4): вычислены на сервере через deriveWorkingBounds.
   * Прокидываются в мини-календарь как базовое окно рабочего дня.
   * `null` = день закрыт или scheduling недоступен → fallback по записям.
   */
  todayWorkingBounds?: { startMinute: number; endMinute: number } | null;
};

export function DoctorTodayDashboard({
  data,
  kpiStats,
  appointmentsTodayCount,
  monthAppointmentCount,
  displayIana,
  adminHealthBanner,
  adminRegistrationFailureBanner,
  // showAnalyticsLink убран из шапки «Сегодня» (R3) — проп больше не читается
  todayWorkingBounds,
}: Props) {
  // Вычисляем серверное время в бизнес-таймзоне для mini-calendar и карточки приёма
  const nowDt = DateTime.now().setZone(displayIana);
  const nowMinutes = nowDt.hour * 60 + nowDt.minute;
  const todayIso = nowDt.toISODate() ?? new Date().toISOString().slice(0, 10);
  const todayDateLabel = nowDt.setLocale("ru").toFormat("EEE, d MMMM");

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
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive no-underline hover:bg-destructive/10"
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
                        {(c.lastName ?? c.firstName) ? (
                          <>
                            <span className="block truncate">
                              {[c.lastName, c.firstName].filter(Boolean).join(" ")}
                            </span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">
                              {c.displayName}
                            </span>
                          </>
                        ) : (
                          <span className="truncate">{c.displayName}</span>
                        )}
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
          {/* 3 KPI: Записи сегодня, Записи неделя, Записи месяц */}
          <DoctorTodayRightKpiRow
            appointmentsTodayCount={appointmentsTodayCount}
            weekAppointmentsCount={kpiStats.appointments.total}
            monthAppointmentCount={monthAppointmentCount}
            todayAppointments={data.todayAppointments}
            weekAppointments={data.weekAppointments}
            monthAppointments={data.monthAppointments}
          />

          {/* §1.1: Мини-календарь — расписание на сегодня (выше «Следующей записи») */}
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
