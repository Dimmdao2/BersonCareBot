import Link from "next/link";
import type { TodayDashboardData } from "./loadDoctorTodayDashboard";

type Props = {
  data: TodayDashboardData;
};

export function DoctorTodayDashboard({ data }: Props) {
  return (
    <div id="doctor-today-dashboard" className="flex flex-col gap-3">
      <header
        id="doctor-today-header"
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 flex flex-col gap-1">
          <h1 className="text-base font-semibold tracking-tight text-foreground">Сегодня</h1>
          <p className="text-sm text-muted-foreground">Рабочие задачи на ближайшие часы</p>
        </div>
        <Link
          id="doctor-today-link-stats"
          href="/app/doctor/stats"
          className="shrink-0 text-sm text-primary underline underline-offset-2"
        >
          Открыть статистику
        </Link>
      </header>

      <section
        id="doctor-today-section-today-appointments"
        className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3"
      >
        <h2 className="text-sm font-semibold text-foreground">Записи сегодня</h2>
        {data.todayAppointments.length === 0 ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>На сегодня записей нет</p>
            <Link href="/app/doctor/appointments" className="text-primary underline underline-offset-2 w-fit">
              Открыть записи
            </Link>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {data.todayAppointments.map((a) => (
              <li
                key={a.id}
                id={`doctor-today-today-appt-${a.id}`}
                className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm"
              >
                {a.scheduleProvenancePrefix ? (
                  <p className="text-xs text-muted-foreground mb-1">{a.scheduleProvenancePrefix}</p>
                ) : null}
                <p className="font-medium text-foreground">
                  {a.time} · {a.clientLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.type} · {a.status}
                  {a.branchName ? ` · ${a.branchName}` : ""}
                </p>
                <p className="mt-2">
                  <Link href={a.href} className="text-primary underline underline-offset-2">
                    {a.ctaLabel}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="doctor-today-section-intake" className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Новые онлайн-заявки</h2>
        {data.newIntakeRequests.length === 0 ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Новых заявок нет</p>
            <Link href="/app/doctor/online-intake" className="text-primary underline underline-offset-2 w-fit">
              Открыть все заявки
            </Link>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {data.newIntakeRequests.map((r) => (
              <li
                key={r.id}
                id={`doctor-today-intake-${r.id}`}
                className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm"
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
                  <Link href={r.href} className="text-primary underline underline-offset-2">
                    Открыть заявку
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="doctor-today-section-messages" className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-foreground">Непрочитанные сообщения</h2>
          {data.unreadTotal > 0 ? (
            <p className="text-xs text-muted-foreground" id="doctor-today-messages-total">
              Всего непрочитанных: {data.unreadTotal}
            </p>
          ) : null}
        </div>
        {data.unreadConversations.length === 0 ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Непрочитанных сообщений нет</p>
            <Link href="/app/doctor/messages" className="text-primary underline underline-offset-2 w-fit">
              Открыть все сообщения
            </Link>
          </div>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {data.unreadConversations.map((c) => (
              <li
                key={c.conversationId}
                id={`doctor-today-msg-${c.conversationId}`}
                className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm"
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
                  <Link href={c.href} className="text-primary underline underline-offset-2">
                    Открыть сообщения
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="doctor-today-section-upcoming"
        className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3"
      >
        <h2 className="text-sm font-semibold text-foreground">Ближайшие записи</h2>
        {data.upcomingAppointments.length === 0 ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Ближайших записей на неделе нет</p>
            <Link
              href="/app/doctor/appointments?view=future"
              className="text-primary underline underline-offset-2 w-fit"
            >
              Все записи
            </Link>
          </div>
        ) : (
          <>
            <ul className="m-0 list-none space-y-2 p-0">
              {data.upcomingAppointments.map((a) => (
                <li
                  key={a.id}
                  id={`doctor-today-upcoming-appt-${a.id}`}
                  className="rounded-lg border border-border/70 bg-background/40 p-3 text-sm"
                >
                  {a.scheduleProvenancePrefix ? (
                    <p className="text-xs text-muted-foreground mb-1">{a.scheduleProvenancePrefix}</p>
                  ) : null}
                  <p className="font-medium text-foreground">
                    {a.time} · {a.clientLabel}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.type} · {a.status}
                    {a.branchName ? ` · ${a.branchName}` : ""}
                  </p>
                  <p className="mt-2">
                    <Link href={a.href} className="text-primary underline underline-offset-2">
                      {a.ctaLabel}
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
            <p>
              <Link
                href="/app/doctor/appointments?view=future"
                className="text-sm text-primary underline underline-offset-2"
              >
                Все записи
              </Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
