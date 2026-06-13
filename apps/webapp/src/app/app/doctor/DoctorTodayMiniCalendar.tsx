"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { doctorSectionSubtitleClass, doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";

const HOUR_HEIGHT_PX = 56;
const TIMELINE_LEFT_W = 36; // ширина колонки меток (px)
// Предполагаем 1-часовую длительность записи (stub).
// TODO doctor.md TODO#1: использовать реальную длительность из AppointmentRow.
const STUB_DURATION_MINUTES = 60;

function parseTimeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Вычисляет диапазон мини-календаря.
 *
 * Логика (§1.2):
 * 1. Базовое окно = рабочие границы (workingBounds), если есть.
 * 2. Записи расширяют окно, если выходят за пределы рабочего дня.
 * 3. Если рабочих границ нет (день закрыт / scheduling недоступен) — fallback по записям.
 */
function computeRange(
  appointments: TodayAppointmentItem[],
  workingBounds?: { startMinute: number; endMinute: number } | null,
): { startHour: number; endHour: number } {
  const CLAMP_MIN = 7;
  const CLAMP_MAX = 22;
  const DEFAULT_START = 9;
  const DEFAULT_END = 19;

  // Собираем минуты начала каждой записи
  const apptMinutes = appointments
    .map((a) => parseTimeToMinutes(a.time))
    .filter((m): m is number => m >= 0);

  // Базовые границы: рабочие часы или fallback
  let baseStartMinute: number;
  let baseEndMinute: number;

  if (workingBounds != null) {
    baseStartMinute = workingBounds.startMinute;
    baseEndMinute = workingBounds.endMinute;
  } else if (apptMinutes.length === 0) {
    return { startHour: DEFAULT_START, endHour: DEFAULT_END };
  } else {
    // Fallback: только по записям (старое поведение)
    const minHour = Math.floor(Math.min(...apptMinutes) / 60);
    const maxHour = Math.floor(Math.max(...apptMinutes) / 60);
    const startHour = Math.max(CLAMP_MIN, minHour - 1);
    const endHour = Math.min(CLAMP_MAX, maxHour + 2);
    return { startHour, endHour };
  }

  // Расширяем рабочие границы записями, если запись выходит за пределы смены
  let startMinute = baseStartMinute;
  let endMinute = baseEndMinute;
  for (const m of apptMinutes) {
    if (m < startMinute) startMinute = m;
    // конец записи = начало + STUB_DURATION_MINUTES
    const mEnd = m + STUB_DURATION_MINUTES;
    if (mEnd > endMinute) endMinute = mEnd;
  }

  // Добавляем буфер: 30 мин до начала, 30 мин после конца; затем clamp и округление до часа
  const startHour = Math.max(CLAMP_MIN, Math.floor((startMinute - 30) / 60));
  const endHour = Math.min(CLAMP_MAX, Math.ceil((endMinute + 30) / 60));
  return { startHour, endHour };
}

/** Возвращает минуты с полуночи в заданной IANA-таймзоне без сторонних библиотек. */
function nowMinutesInZone(displayIana: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: displayIana,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    // Intl может вернуть "24" для полуночи в некоторых средах
    return (h % 24) * 60 + m;
  } catch {
    // Fallback на локальное время если таймзона не поддерживается
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

type Props = {
  appointments: TodayAppointmentItem[];
  /** Минуты с полуночи в бизнес-таймзоне (вычислены на сервере для hydration). */
  nowMinutes: number;
  /** Подпись даты, напр. «ср, 11 июня». */
  todayDateLabel: string;
  /** IANA-таймзона для корректного обновления линии «сейчас» на клиенте. */
  displayIana: string;
  /**
   * Рабочие границы дня в минутах от полуночи (§1.2, S4).
   * Вычисляются на сервере через deriveWorkingBounds; `null` = день закрыт/нет данных.
   * При наличии используются как базовое окно; записи могут расширять, но не сужать.
   */
  workingBounds?: { startMinute: number; endMinute: number } | null;
};

export function DoctorTodayMiniCalendar({ appointments, nowMinutes, todayDateLabel, displayIana, workingBounds }: Props) {
  const { startHour, endHour } = computeRange(appointments, workingBounds);
  const totalHours = endHour - startHour;
  const totalHeight = totalHours * HOUR_HEIGHT_PX;

  // Красная линия «сейчас» — обновляется каждую минуту в бизнес-таймзоне
  const [currentNowMinutes, setCurrentNowMinutes] = useState(nowMinutes);
  useEffect(() => {
    const update = () => setCurrentNowMinutes(nowMinutesInZone(displayIana));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [displayIana]);

  const nowTopPx =
    currentNowMinutes >= startHour * 60 && currentNowMinutes <= endHour * 60
      ? ((currentNowMinutes - startHour * 60) / 60) * HOUR_HEIGHT_PX
      : null;

  const hours = Array.from({ length: totalHours }, (_, i) => startHour + i);

  return (
    <DoctorSection id="doctor-today-mini-calendar">
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>Расписание на сегодня</DoctorSectionTitle>
        <span className={doctorSectionSubtitleClass}>{todayDateLabel}</span>
      </div>

      {appointments.length === 0 ? (
        <DoctorEmptyState>
          <p>Записей на сегодня нет</p>
          <Link href="/app/doctor/schedule?tab=calendar" className={`${doctorInlineLinkClass} w-fit`}>
            Открыть расписание
          </Link>
        </DoctorEmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {/* Сетка: метки времени + слоты */}
          <div
            className="relative select-none"
            style={{ height: totalHeight }}
          >
            {/* Часовые линии и метки */}
            {hours.map((h) => {
              const top = (h - startHour) * HOUR_HEIGHT_PX;
              return (
                <div
                  key={h}
                  className="pointer-events-none absolute left-0 right-0 flex items-start"
                  style={{ top }}
                >
                  {/* Метка времени */}
                  <span
                    className="shrink-0 text-right text-[10px] leading-none text-muted-foreground/70 tabular-nums"
                    style={{ width: TIMELINE_LEFT_W, paddingRight: 6, paddingTop: 2 }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </span>
                  {/* Горизонтальная линия */}
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              );
            })}

            {/* Блоки записей */}
            {appointments.map((appt) => {
              const apptMin = parseTimeToMinutes(appt.time);
              if (apptMin < 0) return null;
              const top = ((apptMin - startHour * 60) / 60) * HOUR_HEIGHT_PX;
              const height = (STUB_DURATION_MINUTES / 60) * HOUR_HEIGHT_PX;
              // Не показывать блоки вне диапазона
              if (top < 0 || top > totalHeight) return null;
              return (
                <Link
                  key={appt.id}
                  href={appt.href}
                  className="absolute flex flex-col justify-start overflow-hidden rounded-r-md border-l-2 border-primary bg-primary/10 px-1.5 py-1 hover:bg-primary/20"
                  style={{
                    left: TIMELINE_LEFT_W,
                    right: 4,
                    top: top + 1,
                    height: Math.max(height - 2, 20),
                  }}
                  title={`${appt.time} · ${appt.clientLabel}${appt.type ? ` · ${appt.type}` : ""}`}
                >
                  <span className="truncate text-[11px] font-medium leading-tight text-primary">
                    {appt.clientLabel}
                  </span>
                  <span className="truncate text-[10px] leading-tight text-primary/70">
                    {appt.time}{appt.type ? ` · ${appt.type}` : ""}
                  </span>
                </Link>
              );
            })}

            {/* Красная линия «сейчас» */}
            {nowTopPx !== null ? (
              <div
                className="pointer-events-none absolute left-0 right-0 z-10"
                style={{ top: nowTopPx }}
              >
                <div className="relative h-px bg-destructive">
                  <span className="absolute -left-0.5 -top-1.5 size-3 rounded-full bg-destructive" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </DoctorSection>
  );
}
