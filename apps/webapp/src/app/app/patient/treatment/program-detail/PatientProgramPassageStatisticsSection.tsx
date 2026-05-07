"use client";

import { useEffect, useState } from "react";
import type { PatientPlanPassageStats } from "@/modules/treatment-program/patient-plan-passage-stats";
import { calendarDayIndexSinceInstanceCreated } from "@/modules/treatment-program/patient-plan-passage-stats";
import {
  patientBodyTextClass,
  patientCardClass,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";
import { PatientProgramBlockHeading } from "@/app/app/patient/treatment/program-detail/PatientProgramBlockHeading";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function PatientProgramPassageStatisticsSection(props: {
  instanceId: string;
  detailCreatedAtIso: string;
  detailStatus: "active" | "completed";
  patientCalendarDayIana: string;
  refreshToken: number;
}) {
  const {
    instanceId,
    detailCreatedAtIso,
    detailStatus,
    patientCalendarDayIana,
    refreshToken,
  } = props;

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setNowMs(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dayIndex = calendarDayIndexSinceInstanceCreated(
    detailCreatedAtIso,
    nowMs,
    patientCalendarDayIana,
  );
  const showCollectingCopy = dayIndex <= 2;

  const [stats, setStats] = useState<PatientPlanPassageStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (showCollectingCopy) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setStatsError(null);
      const res = await fetch(
        `/api/patient/treatment-program-instances/${encodeURIComponent(instanceId)}/passage-stats`,
      );
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        stats?: PatientPlanPassageStats;
        error?: string;
      };
      if (cancelled) return;
      if (!res.ok || !data.ok || !data.stats) {
        setStats(null);
        setStatsError(data.error ?? "Не удалось загрузить статистику");
        return;
      }
      setStats(data.stats);
    })();
    return () => {
      cancelled = true;
    };
  }, [instanceId, showCollectingCopy, refreshToken, detailStatus]);

  return (
    <section className={patientCardClass} aria-label="Статистика прохождения">
      <PatientProgramBlockHeading
        title="Статистика прохождения"
        Icon={TrendingUp}
        iconClassName="text-[var(--patient-color-primary)]"
      />
      {showCollectingCopy ? (
        <div className={cn(patientMutedTextClass, "space-y-2 text-sm leading-snug")}>
          <p className={patientBodyTextClass}>Статистика пока собирается.</p>
          <p>Регулярность в занятиях - основа вашего здоровья!</p>
        </div>
      ) : statsError ? (
        <p className="text-sm text-destructive" role="alert">
          {statsError}
        </p>
      ) : stats ? (
        <ul className={cn(patientMutedTextClass, "m-0 list-none space-y-1.5 p-0 text-sm leading-snug")}>
          <li>Дней с занятиями: {stats.daysWithActivity}</li>
          <li>Пропущено дней: {stats.missedDays}</li>
          <li>Среднее выполнений в день: {stats.avgCompletionsPerDay}</li>
          <li>Назначений ещё не выполнялось: {stats.neverCompletedChecklistItemCount}</li>
        </ul>
      ) : (
        <p className={patientMutedTextClass}>Загрузка…</p>
      )}
    </section>
  );
}
