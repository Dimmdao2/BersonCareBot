import { CircleHelp, Dumbbell, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { AdminRegistrationFailureAttention } from "@/app-layer/product-analytics/loadAdminRegistrationFailureAttention";
import type { AdminDoctorTodayHealthBanner } from "@/modules/operator-health/adminDoctorTodayHealthBanner";
import type { DoctorStatsState } from "@/modules/doctor-stats/service";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorInlineLinkClass, doctorPageStackClass, doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorTodayAttentionSection } from "./DoctorTodayAttentionSection";
import { DoctorTodayKpiSection } from "./DoctorTodayKpiSection";
import { DoctorGlobalTasksSection } from "./DoctorGlobalTasksSection";
import {
  ON_SUPPORT_LIST_HREF,
  PROGRAM_WITHOUT_SUPPORT_LIST_HREF,
  type TodayAppointmentItem,
  type TodayDashboardData,
} from "./loadDoctorTodayDashboard";

function TodayAppointmentRow({
  appointment: a,
  idPrefix,
}: {
  appointment: TodayAppointmentItem;
  idPrefix: "today" | "upcoming";
}) {
  return (
    <li id={`doctor-today-${idPrefix}-appt-${a.id}`} className={doctorSectionItemClass}>
      {a.scheduleProvenancePrefix ? (
        <p className="mb-1 text-xs text-muted-foreground">{a.scheduleProvenancePrefix}</p>
      ) : null}
      <p className="font-medium text-foreground">
        <span>{a.time} · </span>
        {a.clientUserId ? (
          <Link href={a.href} className={doctorInlineLinkClass}>
            {a.clientLabel}
          </Link>
        ) : (
          <span>{a.clientLabel}</span>
        )}
      </p>
      {a.rubitimeNameIfDifferent ? (
        <p className="mt-0.5 text-xs text-muted-foreground">В Rubitime: {a.rubitimeNameIfDifferent}</p>
      ) : null}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {a.type} · {a.status}
        {a.branchName ? ` · ${a.branchName}` : ""}
      </p>
    </li>
  );
}

type Props = {
  data: TodayDashboardData;
  kpiStats: DoctorStatsState;
  appointmentsTodayCount: number;
  adminHealthBanner?: AdminDoctorTodayHealthBanner;
  adminRegistrationFailureBanner?: AdminRegistrationFailureAttention;
  showAnalyticsLink?: boolean;
};

export function DoctorTodayDashboard({
  data,
  kpiStats,
  appointmentsTodayCount,
  adminHealthBanner,
  adminRegistrationFailureBanner,
  showAnalyticsLink,
}: Props) {
  return (
    <div id="doctor-today-dashboard" className={doctorPageStackClass}>
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
      <header
        id="doctor-today-header"
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 flex flex-col gap-1">
          <h1 className="text-base font-semibold tracking-tight text-foreground">Сегодня</h1>
          <p className="text-sm text-muted-foreground">Рабочие задачи на ближайшие часы</p>
        </div>
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

      <DoctorTodayKpiSection
        kpiStats={kpiStats}
        appointmentsTodayCount={appointmentsTodayCount}
        unreadMessagesCount={data.unreadTotal}
      />

      <div
        id="doctor-today-primary-row"
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] md:items-stretch"
      >
        <DoctorSection id="doctor-today-section-on-support" className="min-w-0 h-full">
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
                  <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
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

        <div className="min-w-0 flex">
          <DoctorTodayAttentionSection
            intakeCount={data.newIntakeRequests.length}
            pendingTestsCount={data.pendingProgramTestsTotal}
            proactiveCount={data.proactiveInsightsTotal}
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
        </div>

        <div className="min-w-0 flex">
          <DoctorGlobalTasksSection initialTasks={data.globalOpenTasks} className="flex-1" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <DoctorSection id="doctor-today-section-today-appointments">
          <DoctorSectionTitle>Записи сегодня</DoctorSectionTitle>
          {data.todayAppointments.length === 0 ? (
            <DoctorEmptyState>
              <p>На сегодня записей нет</p>
              <Link href="/app/doctor/appointments" className={`${doctorInlineLinkClass} w-fit`}>
                Открыть записи
              </Link>
            </DoctorEmptyState>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {data.todayAppointments.map((a) => (
                <TodayAppointmentRow key={a.id} appointment={a} idPrefix="today" />
              ))}
            </ul>
          )}
        </DoctorSection>

        {data.todayAppointments.length === 0 ? (
          <DoctorSection id="doctor-today-section-upcoming">
            <DoctorSectionTitle>Ближайшие записи</DoctorSectionTitle>
            {data.upcomingAppointments.length === 0 ? (
              <DoctorEmptyState>
                <p>Ближайших записей на неделе нет</p>
                <Link
                  href="/app/doctor/appointments?view=future"
                  className={`${doctorInlineLinkClass} w-fit`}
                >
                  Все записи
                </Link>
              </DoctorEmptyState>
            ) : (
              <>
                <ul className="m-0 list-none space-y-2 p-0">
                  {data.upcomingAppointments.map((a) => (
                    <TodayAppointmentRow key={a.id} appointment={a} idPrefix="upcoming" />
                  ))}
                </ul>
                <p>
                  <Link
                    href="/app/doctor/appointments?view=future"
                    className={`${doctorInlineLinkClass} text-sm`}
                  >
                    Все записи
                  </Link>
                </p>
              </>
            )}
          </DoctorSection>
        ) : null}
      </div>
    </div>
  );
}
