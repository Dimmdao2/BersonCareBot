"use client";

/**
 * DEV-ONLY: Chart test page for ExerciseExecutionGraph acceptance.
 * Route: /app/doctor/dev/chart-test?instanceId=...&stageItemId=...&userId=...
 *
 * Remove or gate behind IS_DEV before production merge.
 */

import { useState, useEffect } from "react";
import { ExerciseExecutionGraph, type DayBar } from "@/shared/ui/doctor/ExerciseExecutionGraph";
import { type ExerciseMetricPoint } from "@/shared/ui/doctor/ExerciseMicroChart";
import { useSearchParams } from "next/navigation";

export default function ChartTestPage() {
  const searchParams = useSearchParams();
  const instanceId = searchParams.get("instanceId") ?? "7586d495-b8d5-4443-b506-be967fa0b035";
  const stageItemId = searchParams.get("stageItemId") ?? "5c2a0ad5-ac6f-4458-945e-17e645e54b80";
  const userId = searchParams.get("userId") ?? "1c312a64-fab8-4b75-b24e-88a1d6ebe4e0";

  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [metricPoints, setMetricPoints] = useState<ExerciseMetricPoint[]>([]);
  const [dayBars, setDayBars] = useState<DayBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [metricsRes, dayRes] = await Promise.all([
          fetch(`/api/doctor/comments/exercise-metrics?instanceId=${instanceId}&stageItemId=${stageItemId}&windowDays=${windowDays}`),
          fetch(`/api/doctor/clients/${userId}/program-day-activity?instanceId=${instanceId}&windowDays=${windowDays}`),
        ]);
        const metricsData = await metricsRes.json() as { ok: boolean; points?: ExerciseMetricPoint[] };
        const dayData = await dayRes.json() as { ok: boolean; days?: DayBar[] };
        setMetricPoints(metricsData.ok ? (metricsData.points ?? []) : []);
        setDayBars(dayData.ok ? (dayData.days ?? []) : []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [instanceId, stageItemId, userId, windowDays]);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-xl font-bold">Chart Dev Test: ExerciseExecutionGraph</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        instanceId: {instanceId}<br />
        stageItemId: {stageItemId}<br />
        userId: {userId}
      </p>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {!loading && (
        <div className="rounded-lg border border-border bg-card p-4">
          <ExerciseExecutionGraph
            metricPoints={metricPoints}
            dayBars={dayBars}
            windowDays={windowDays}
            onWindowChange={setWindowDays}
          />
          <div className="mt-4 text-xs text-muted-foreground">
            <p>Metric points: {metricPoints.length}</p>
            <p>Day bars: {dayBars.length}</p>
            {metricPoints.length > 0 && (
              <p>First point: reps={metricPoints[0]?.reps}, weight={metricPoints[0]?.weightKg}, diff={metricPoints[0]?.difficulty}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
