"use client";

/**
 * DoctorProgramOverviewPanel — S3.1
 *
 * Отображает ExerciseExecutionGraph с данными из двух API:
 *   - /api/doctor/comments/exercise-metrics  (метрики упражнений)
 *   - /api/doctor/clients/:userId/program-day-activity  (активность по дням)
 *
 * Примечание: exercise-metrics требует stageItemId, которого здесь нет —
 * в режиме обзора программы мы показываем дневную активность как основной
 * индикатор, а метрики упражнений покажем только если userId+instanceId
 * уже имеют данные (пустая серия прячется автоматически ExerciseExecutionGraph).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ExerciseMetricPoint } from "@/shared/ui/doctor/ExerciseMicroChart";
import {
  ExerciseExecutionGraph,
  type DayBar,
} from "@/shared/ui/doctor/ExerciseExecutionGraph";
import { doctorClientTreatmentProgramInstanceHref } from "./doctorClientInstanceHref";
import {
  doctorClientSectionTitleClass,
  doctorClientTabSectionClass,
  doctorClientStackedCardClass,
} from "./doctorClientCardChrome";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { cn } from "@/lib/utils";

type Props = {
  userId: string;
  instanceId: string;
  profileListScope?: string;
};

type FetchState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: T }
  | { status: "error" };

export function DoctorProgramOverviewPanel({
  userId,
  instanceId,
  profileListScope,
}: Props) {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);

  const [metricsState, setMetricsState] = useState<
    FetchState<ExerciseMetricPoint[]>
  >({ status: "idle" });

  const [barsState, setBarsState] = useState<FetchState<DayBar[]>>({
    status: "idle",
  });

  // Note: exercise-metrics also needs stageItemId; without it we can only
  // show an empty metrics chart. We intentionally fetch with no stageItemId
  // here — the route will return 400, and we'll treat it as "no data".
  // The real per-exercise chart lives inside the instance detail page.
  // For overview we just show the day-activity bars.
  useEffect(() => {
    const controller = new AbortController();
    setBarsState({ status: "loading" });

    void (async () => {
      try {
        const url = `/api/doctor/clients/${encodeURIComponent(userId)}/program-day-activity?instanceId=${encodeURIComponent(instanceId)}&windowDays=${windowDays}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as {
          ok: boolean;
          days?: DayBar[];
        };
        if (!data.ok || !data.days) throw new Error("bad response");
        setBarsState({ status: "done", data: data.days });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setBarsState({ status: "error" });
      }
    })();

    return () => controller.abort();
  }, [userId, instanceId, windowDays]);

  // We don't attempt to fetch per-exercise metrics at the program-overview
  // level (no stageItemId). Metrics stay empty; ExerciseExecutionGraph hides
  // empty series automatically.
  const metricPoints: ExerciseMetricPoint[] =
    metricsState.status === "done" ? metricsState.data : [];
  void metricsState; // suppress unused-var lint

  const dayBars: DayBar[] =
    barsState.status === "done" ? barsState.data : [];

  const isLoading = barsState.status === "loading";
  const instanceHref = doctorClientTreatmentProgramInstanceHref(
    userId,
    instanceId,
    { profileListScope },
  );

  return (
    <div className="flex flex-col gap-0">
      <section className={doctorClientTabSectionClass}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className={doctorClientSectionTitleClass}>Активность программы</h3>
          <Link
            href={instanceHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "text-xs",
            )}
          >
            Открыть программу
          </Link>
        </div>

        {isLoading ? (
          <div className={cn(doctorClientStackedCardClass, "space-y-2")}>
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-16 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className={doctorClientStackedCardClass}>
            <ExerciseExecutionGraph
              metricPoints={metricPoints}
              dayBars={dayBars}
              windowDays={windowDays}
              onWindowChange={setWindowDays}
            />
          </div>
        )}
      </section>

      <section className={doctorClientTabSectionClass}>
        <h3 className={cn(doctorClientSectionTitleClass, "mb-2")}>
          Комментарии к программе
        </h3>
        <p className="text-xs text-muted-foreground">
          Полный журнал обсуждений доступен на странице программы.{" "}
          <Link href={instanceHref} className="underline hover:text-foreground">
            Перейти к программе
          </Link>
        </p>
      </section>
    </div>
  );
}
