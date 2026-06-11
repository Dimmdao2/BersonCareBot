import Link from "next/link";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import {
  doctorSectionItemClass,
  doctorSectionSubtitleClass,
  doctorInlineLinkClass,
} from "@/shared/ui/doctor/doctorVisual";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";

/** Парсит "HH:MM" → минуты с полуночи. Возвращает -1 при ошибке. */
function parseTimeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

/** Выбирает текущую или следующую запись из упорядоченного по времени списка. */
function findCurrentOrNext(
  appointments: TodayAppointmentItem[],
  nowMinutes: number,
): {
  primary: TodayAppointmentItem | null;
  isOngoing: boolean;
  next: TodayAppointmentItem | null;
} {
  // Предполагаем 1.5-часовую длительность как stub (нет поля duration в TodayAppointmentItem).
  // TODO: добавить duration в TodayAppointmentItem для точного определения текущего приёма.
  const STUB_DURATION_MINUTES = 90;

  let ongoing: TodayAppointmentItem | null = null;
  let nextAppt: TodayAppointmentItem | null = null;

  for (const appt of appointments) {
    const apptMin = parseTimeToMinutes(appt.time);
    if (apptMin < 0) continue;
    if (apptMin <= nowMinutes && nowMinutes < apptMin + STUB_DURATION_MINUTES) {
      ongoing = appt;
    } else if (apptMin > nowMinutes && nextAppt === null) {
      nextAppt = appt;
    }
  }

  if (ongoing) {
    // Найти следующую ПОСЛЕ текущего (не саму текущую)
    const ongoingMin = parseTimeToMinutes(ongoing.time);
    const afterOngoing = appointments.find((a) => {
      const m = parseTimeToMinutes(a.time);
      return m > ongoingMin + STUB_DURATION_MINUTES || (m > ongoingMin && a.id !== ongoing!.id);
    }) ?? null;
    return { primary: ongoing, isOngoing: true, next: afterOngoing };
  }

  return { primary: nextAppt, isOngoing: false, next: null };
}

type Props = {
  appointments: TodayAppointmentItem[];
  /** Минуты с полуночи в бизнес-таймзоне (вычислены на сервере). */
  nowMinutes: number;
};

export function DoctorCurrentAppointmentCard({ appointments, nowMinutes }: Props) {
  const { primary, isOngoing, next } = findCurrentOrNext(appointments, nowMinutes);

  return (
    <DoctorSection id="doctor-today-current-appt">
      <DoctorSectionTitle>
        {isOngoing ? "Сейчас на приёме" : "Следующая запись"}
      </DoctorSectionTitle>

      {primary === null ? (
        <DoctorEmptyState>
          <p>
            {appointments.length === 0
              ? "На сегодня записей нет"
              : "Все записи на сегодня завершены"}
          </p>
          <Link href="/app/doctor/schedule?tab=calendar" className={`${doctorInlineLinkClass} w-fit`}>
            Открыть расписание
          </Link>
        </DoctorEmptyState>
      ) : (
        <div className={doctorSectionItemClass}>
          {/* Имя и время */}
          <p className="font-medium text-foreground">
            {primary.clientUserId ? (
              <Link href={primary.href} className={doctorInlineLinkClass}>
                {primary.clientLabel}
              </Link>
            ) : (
              <span>{primary.clientLabel}</span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-foreground">
            {primary.time}
            {primary.type ? ` · ${primary.type}` : ""}
          </p>

          {/* Мета-информация */}
          {(primary.status || primary.branchName) ? (
            <p className={`mt-0.5 ${doctorSectionSubtitleClass}`}>
              {[primary.status, primary.branchName].filter(Boolean).join(" · ")}
            </p>
          ) : null}

          {primary.scheduleProvenancePrefix ? (
            <p className={`mt-0.5 ${doctorSectionSubtitleClass}`}>
              {primary.scheduleProvenancePrefix}
            </p>
          ) : null}

          {/* Контакты: TODO#1 — нет в TodayAppointmentItem, см. doctor.md */}

          {/* CTA */}
          {primary.clientUserId ? (
            <div className="mt-2">
              <Link href={primary.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
                Открыть карточку пациента
              </Link>
            </div>
          ) : null}
        </div>
      )}

      {/* Следующий после текущего */}
      {next ? (
        <p className={doctorSectionSubtitleClass}>
          Следующий: {next.time} · {next.clientLabel}
        </p>
      ) : null}
    </DoctorSection>
  );
}
