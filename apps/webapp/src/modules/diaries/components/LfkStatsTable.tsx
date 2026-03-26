"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDiaryDayShortRu } from "@/modules/diaries/stats/formatDiaryDay";
import { DiaryStatsPeriodBar, type DiaryStatsPeriod } from "./DiaryStatsPeriodBar";

export type LfkStatsComplexOption = { id: string; title: string };

type OverviewPayload = {
  ok: true;
  overview: { days: string[]; matrix: boolean[][] } | null;
  complexes: { id: string; title: string }[];
  detail: null;
  period: string;
  offset: number;
};

type DetailPayload = {
  ok: true;
  overview: null;
  detail: {
    complex: { id: string; title: string };
    sessions: Array<{
      id: string;
      completedAt: string;
      durationMinutes?: number | null;
      difficulty0_10?: number | null;
      pain0_10?: number | null;
      comment?: string | null;
    }>;
    page: number;
    pageSize: number;
    total: number;
  };
  complexes: { id: string; title: string }[];
  period: string;
  offset: number;
};

/** Согласовано с `lfk-stats` route (pageSize по умолчанию на сервере). */
const LFK_STATS_PAGE_SIZE = 20;

export function LfkStatsTable({ complexes }: { complexes: LfkStatsComplexOption[] }) {
  const [period, setPeriod] = useState<DiaryStatsPeriod>("week");
  const [offset, setOffset] = useState(0);
  const [detailComplexId, setDetailComplexId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewPayload["overview"]>(null);
  const [detail, setDetail] = useState<DetailPayload["detail"] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        period,
        offset: String(offset),
        page: String(page),
        pageSize: String(LFK_STATS_PAGE_SIZE),
      });
      if (detailComplexId) {
        qs.set("complexId", detailComplexId);
      }
      const res = await fetch(`/api/patient/diary/lfk-stats?${qs.toString()}`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setError(res.status === 403 ? "Доступ запрещён" : "Требуется вход");
        return;
      }
      if (!res.ok) {
        setError("Не удалось загрузить статистику ЛФК");
        return;
      }
      const data = (await res.json()) as OverviewPayload | DetailPayload;
      if (!data.ok) {
        setError("Ошибка ответа");
        return;
      }
      if (data.detail) {
        setDetail(data.detail);
        setOverview(null);
      } else {
        setOverview(data.overview);
        setDetail(null);
      }
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  }, [period, offset, detailComplexId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages =
    detail && detail.pageSize > 0 ? Math.max(1, Math.ceil(detail.total / detail.pageSize)) : 1;

  const showOverview = Boolean(!loading && !error && overview && detailComplexId === null);
  const showDetail = Boolean(!loading && !error && detail && detailComplexId);

  return (
    <div id="patient-lfk-stats-table" className="stack gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Режим</span>
          <select
            className="auth-input min-w-[200px]"
            value={detailComplexId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setDetailComplexId(v === "" ? null : v);
              setPage(1);
              setOffset(0);
            }}
          >
            <option value="">Обзор по комплексам</option>
            {complexes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <DiaryStatsPeriodBar
          period={period}
          offset={offset}
          onPeriodChange={(p) => {
            setPeriod(p);
            setOffset(0);
            setPage(1);
          }}
          onOffsetChange={setOffset}
        />
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {loading ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Загрузка…
        </p>
      ) : null}

      {showOverview && overview ? (
        <div className="max-w-full overflow-x-auto rounded-md border border-border">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="border-border px-2 py-2 text-left font-medium">День</th>
                {complexes.map((c) => (
                  <th key={c.id} className="border-border max-w-[120px] px-2 py-2 text-center font-medium">
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.days.map((day, i) => (
                <tr key={day}>
                  <td className="border-border text-muted-foreground whitespace-nowrap px-2 py-1">
                    {formatDiaryDayShortRu(day)}
                  </td>
                  {complexes.map((c, j) => {
                    const done = overview.matrix[i]?.[j];
                    return (
                      <td key={c.id} className="border-border px-2 py-1 text-center">
                        <span aria-label={done ? "занятие отмечено" : "нет занятия"}>
                          {done ? "✓" : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showDetail && detail ? (
        <div className="stack gap-2">
          <p className="text-sm font-medium">{detail.complex.title}</p>
          <div className="max-w-full overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border-border px-2 py-2 text-left">Дата</th>
                  <th className="border-border px-2 py-2 text-right">Мин</th>
                  <th className="border-border px-2 py-2 text-right">Сложн.</th>
                  <th className="border-border px-2 py-2 text-right">Боль</th>
                  <th className="border-border px-2 py-2 text-left">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {detail.sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="border-border px-2 py-1 whitespace-nowrap">
                      {new Date(s.completedAt).toLocaleString("ru-RU", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="border-border px-2 py-1 text-right">{s.durationMinutes ?? "—"}</td>
                    <td className="border-border px-2 py-1 text-right">{s.difficulty0_10 ?? "—"}</td>
                    <td className="border-border px-2 py-1 text-right">{s.pain0_10 ?? "—"}</td>
                    <td className="border-border text-muted-foreground max-w-[200px] truncate px-2 py-1">
                      {s.comment ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.total > detail.pageSize ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                Стр. {detail.page} из {totalPages} ({detail.total} записей)
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={detail.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Назад
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={detail.page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Вперёд
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
