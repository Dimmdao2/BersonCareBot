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
import { DoctorTodayPendingProgramTestsSection } from "./DoctorTodayPendingProgramTestsSection";
import { DoctorTodayProactiveInsightsSection } from "./DoctorTodayProactiveInsightsSection";
import {
  ON_SUPPORT_LIST_HREF,
  PROGRAM_WITHOUT_SUPPORT_LIST_HREF,
  type TodayDashboardData,
} from "./loadDoctorTodayDashboard";

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

      <DoctorTodayKpiSection kpiStats={kpiStats} appointmentsTodayCount={appointmentsTodayCount} />

      <DoctorTodayAttentionSection
        intakeCount={data.newIntakeRequests.length}
        messagesCount={data.unreadTotal}
        pendingTestsCount={data.pendingProgramTestsTotal}
        proactiveCount={data.proactiveInsightsTotal}
      />

      <DoctorGlobalTasksSection initialTasks={data.globalOpenTasks} />

      <DoctorTodayProactiveInsightsSection
        items={data.proactiveInsights}
        totalCount={data.proactiveInsightsTotal}
        truncated={data.proactiveInsightsTruncated}
      />

      <DoctorTodayPendingProgramTestsSection
        items={data.pendingProgramTests}
        totalAttempts={data.pendingProgramTestsTotal}
        truncated={data.pendingProgramTestsTruncated}
      />

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
                <li key={c.userId} id={`doctor-today-on-support-${c.userId}`} className="text-sm">
                  <Link href={c.href} className={`${doctorInlineLinkClass} font-medium`}>
                    {c.displayName}
                  </Link>
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
              <li
                key={a.id}
                id={`doctor-today-today-appt-${a.id}`}
                className={doctorSectionItemClass}
              >
                {a.scheduleProvenancePrefix ? (
                  <p className="text-xs text-muted-foreground mb-1">{a.scheduleProvenancePrefix}</p>
                ) : null}
                <p className="font-medium text-foreground">
                  {a.time} · {a.clientLabel}
                </p>
                {a.rubitimeNameIfDifferent ? (
                  <p className="text-xs text-muted-foreground mt-0.5">В Rubitime: {a.rubitimeNameIfDifferent}</p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.type} · {a.status}
                  {a.branchName ? ` · ${a.branchName}` : ""}
                </p>
                <p className="mt-2">
                  <Link href={a.href} className={doctorInlineLinkClass}>
                    {a.ctaLabel}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>

      <DoctorSection id="doctor-today-section-intake">
        <DoctorSectionTitle>Новые онлайн-заявки</DoctorSectionTitle>
        {data.newIntakeRequests.length === 0 ? (
          <DoctorEmptyState>
            <p>Новых заявок нет</p>
            <Link href="/app/doctor/online-intake" className={`${doctorInlineLinkClass} w-fit`}>
              Открыть все заявки
            </Link>
          </DoctorEmptyState>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {data.newIntakeRequests.map((r) => (
              <li
                key={r.id}
                id={`doctor-today-intake-${r.id}`}
                className={doctorSectionItemClass}
              >
                <p className="font-medium text-foreground">{r.patientName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Тел.: {r.patientPhone}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {r.typeLabel} · {r.createdAtLabel}
                </p>
                {r.summaryPreview ? (
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-muted-foreground">{r.summaryPreview}</p>
                ) : null}
                <p className="mt-2">
                  <Link href={r.href} className={doctorInlineLinkClass}>
                    Открыть заявку
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>

      <DoctorSection id="doctor-today-section-messages">
        <DoctorSectionHeader>
          <DoctorSectionTitle>Непрочитанные сообщения</DoctorSectionTitle>
          {data.unreadTotal > 0 ? (
            <p className="text-xs text-muted-foreground" id="doctor-today-messages-total">
              Всего непрочитанных: {data.unreadTotal}
            </p>
          ) : null}
        </DoctorSectionHeader>
        {data.unreadConversations.length === 0 ? (
          <DoctorEmptyState>
            <p>Непрочитанных сообщений нет</p>
            <Link href="/app/doctor/messages" className={`${doctorInlineLinkClass} w-fit`}>
              Открыть все сообщения
            </Link>
          </DoctorEmptyState>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {data.unreadConversations.map((c) => (
              <li
                key={c.conversationId}
                id={`doctor-today-msg-${c.conversationId}`}
                className={doctorSectionItemClass}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-foreground">{c.displayName}</p>
                  <span className="tabular-nums rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium">
                    {c.unreadFromUserCount}
                  </span>
                </div>
                {c.phoneNormalized ? (
                  <p className="text-xs text-muted-foreground mt-0.5">Тел.: {c.phoneNormalized}</p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-1">{c.lastMessageAtLabel}</p>
                {c.lastMessagePreview ? (
                  <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{c.lastMessagePreview}</p>
                ) : null}
                <p className="mt-2">
                  <Link href={c.href} className={doctorInlineLinkClass}>
                    Открыть сообщения
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>

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
                <li
                  key={a.id}
                  id={`doctor-today-upcoming-appt-${a.id}`}
                  className={doctorSectionItemClass}
                >
                  {a.scheduleProvenancePrefix ? (
                    <p className="text-xs text-muted-foreground mb-1">{a.scheduleProvenancePrefix}</p>
                  ) : null}
                  <p className="font-medium text-foreground">
                    {a.time} · {a.clientLabel}
                  </p>
                  {a.rubitimeNameIfDifferent ? (
                    <p className="text-xs text-muted-foreground mt-0.5">В Rubitime: {a.rubitimeNameIfDifferent}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.type} · {a.status}
                    {a.branchName ? ` · ${a.branchName}` : ""}
                  </p>
                  <p className="mt-2">
                    <Link href={a.href} className={doctorInlineLinkClass}>
                      {a.ctaLabel}
                    </Link>
                  </p>
                </li>
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
    </div>
  );
}
