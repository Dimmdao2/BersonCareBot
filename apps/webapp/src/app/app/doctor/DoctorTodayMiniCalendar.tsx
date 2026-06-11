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

function computeRange(appointments: TodayAppointmentItem[]): { startHour: number; endHour: number } {
  const CLAMP_MIN = 7;
  const CLAMP_MAX = 22;
  const DEFAULT_START = 9;
  const DEFAULT_END = 19;

  if (appointments.length === 0) return { startHour: DEFAULT_START, endHour: DEFAULT_END };

  const hours = appointments
    .map((a) => {
      const min = parseTimeToMinutes(a.time);
      return min >= 0 ? Math.floor(min / 60) : null;
    })
    .filter((h): h is number => h !== null);

  if (hours.length === 0) return { startHour: DEFAULT_START, endHour: DEFAULT_END };

  const minHour = Math.min(...hours);
  const maxHour = Math.max(...hours);
  const startHour = Math.max(CLAMP_MIN, minHour - 1);
  // endHour: конец последней записи + 1 буферный час
  const endHour = Math.min(CLAMP_MAX, maxHour + 2);
  return { startHour, endHour };
}

type Props = {
  appointments: TodayAppointmentItem[];
  /** Минуты с полуночи в бизнес-таймзоне (вычислены на сервере для hydration). */
  nowMinutes: number;
  /** Подпись даты, напр. «ср, 11 июня». */
  todayDateLabel: string;
};

export function DoctorTodayMiniCalendar({ appointments, nowMinutes, todayDateLabel }: Props) {
  const { startHour, endHour } = computeRange(appointments);
  const totalHours = endHour - startHour;
  const totalHeight = totalHours * HOUR_HEIGHT_PX;

  // Красная линия «сейчас» — обновляется каждую минуту
  const [currentNowMinutes, setCurrentNowMinutes] = useState(nowMinutes);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentNowMinutes(now.getHours() * 60 + now.getMinutes());
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

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
