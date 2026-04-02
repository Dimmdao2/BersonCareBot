"use client";

import Link from "next/link";
import { useDoctorSupportUnreadCount } from "@/shared/hooks/useSupportUnreadPolling";

type NearestAppointment = {
  id: string;
  clientUserId: string;
  clientLabel: string;
  time: string;
  type: string;
  scheduleProvenancePrefix?: string;
} | null;

type Props = {
  nearestAppointment: NearestAppointment;
};

export function DoctorDashboardContextWidgets({ nearestAppointment }: Props) {
  const unreadCount = useDoctorSupportUnreadCount();

  return (
    <section id="doctor-dashboard-context-widgets" className="mb-8 grid gap-3 md:grid-cols-2">
      <article className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ближайший приём</p>
        {nearestAppointment ? (
          <>
            {nearestAppointment.scheduleProvenancePrefix ? (
              <p className="mt-1 text-xs text-muted-foreground">{nearestAppointment.scheduleProvenancePrefix}</p>
            ) : null}
            <p className="mt-1 text-sm font-medium">
              {nearestAppointment.time} · {nearestAppointment.clientLabel}
            </p>
            <p className="text-xs text-muted-foreground">{nearestAppointment.type}</p>
            <p className="mt-2 text-sm">
              <Link
                href={`/app/doctor/clients/${nearestAppointment.clientUserId}`}
                className="text-primary underline underline-offset-2"
              >
                Открыть карточку клиента
              </Link>
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Нет будущих записей.</p>
        )}
      </article>

      <article className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Непрочитанные сообщения</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{unreadCount}</p>
        <p className="mt-2 text-sm">
          <Link href="/app/doctor/messages" className="text-primary underline underline-offset-2">
            Перейти в сообщения
          </Link>
        </p>
      </article>
    </section>
  );
}
