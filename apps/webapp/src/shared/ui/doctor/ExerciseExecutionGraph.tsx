"use client";

/**
 * ExerciseExecutionGraph — SVG-based two-panel chart for S3.1.
 *
 * Top panel: 3-line polyline chart (difficulty, weightKg, reps×sets).
 * Bottom panel: per-day bar chart (assignedCount / doneCount).
 *
 * Pure SVG — no recharts dependency.
 */

import type { ExerciseMetricPoint } from "./ExerciseMicroChart";

// ── Types ────────────────────────────────────────────────────────────────────

export type DayBar = {
  localDate: string;
  assignedCount: number;
  doneCount: number;
};

export type ExerciseExecutionGraphProps = {
  metricPoints: ExerciseMetricPoint[];
  dayBars: DayBar[];
  windowDays?: 7 | 30;
  onWindowChange?: (days: 7 | 30) => void;
  className?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const VIEW_W = 400;
const CHART_H = 100;
const BAR_H = 60;
const PADDING = { top: 8, right: 8, bottom: 8, left: 8 };

/** Normalize a series of numbers to [0..100]. Returns empty array if all null. */
function normalizeNumericSeries(values: (number | null)[]): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return values.map(() => null);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return values.map((v) => (v === null ? null : 50));
  return values.map((v) =>
    v === null ? null : ((v - min) / (max - min)) * 100,
  );
}

/** Convert difficulty to 0..100 numeric: easy=33, medium=66, hard=100 */
function difficultyToNumeric(d: string | null): number | null {
  if (d === "easy") return 33;
  if (d === "medium") return 66;
  if (d === "hard") return 100;
  return null;
}

/** Build SVG polyline `points` attribute string from normalized values and x positions. */
function buildPolylinePoints(
  normalizedValues: (number | null)[],
  xPositions: number[],
): string {
  const pts: string[] = [];
  for (let i = 0; i < normalizedValues.length; i++) {
    const v = normalizedValues[i];
    if (v === null) continue;
    const x = xPositions[i];
    // SVG Y axis is top-down; value 0 → bottom, 100 → top
    const y = PADDING.top + (CHART_H - PADDING.top - PADDING.bottom) * (1 - v / 100);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function formatLocalDate(d: string): string {
  // d = "YYYY-MM-DD"
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}.${parts[1]}`;
}

// ── Day bar coloring ──────────────────────────────────────────────────────────

function dayBarColor(assigned: number, done: number): string {
  if (assigned === 0) return "#9ca3af"; // gray-400
  if (done >= assigned) return "#22c55e"; // green-500
  if (done > 0) return "#eab308"; // yellow-500
  return "#9ca3af"; // gray-400 — none done
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExerciseExecutionGraph({
  metricPoints,
  dayBars,
  windowDays = 7,
  onWindowChange,
  className,
}: ExerciseExecutionGraphProps) {
  const ordered = [...metricPoints].sort((a, b) => a.at.localeCompare(b.at));

  // ── Line chart setup ──────────────────────────────────────────────────────

  const n = ordered.length;
  const innerW = VIEW_W - PADDING.left - PADDING.right;

  // X positions for each metric point
  const xPositions: number[] =
    n <= 1
      ? [PADDING.left + innerW / 2]
      : ordered.map(
          (_, i) => PADDING.left + (i / (n - 1)) * innerW,
        );

  // Severity (difficulty) series
  const difficultyRaw = ordered.map((p) => difficultyToNumeric(p.difficulty));
  const difficultyNorm = normalizeNumericSeries(difficultyRaw);
  const hasDifficulty = difficultyNorm.some((v) => v !== null);
  const difficultyPoints = buildPolylinePoints(difficultyNorm, xPositions);

  // Weight series
  const weightRaw = ordered.map((p) => p.weightKg);
  const weightNorm = normalizeNumericSeries(weightRaw);
  const hasWeight = weightNorm.some((v) => v !== null);
  const weightPoints = buildPolylinePoints(weightNorm, xPositions);

  // Reps×sets series (if sets null, use reps only)
  const repsRaw = ordered.map((p) => {
    if (p.reps === null) return null;
    return p.sets !== null ? p.reps * p.sets : p.reps;
  });
  const repsNorm = normalizeNumericSeries(repsRaw);
  const hasReps = repsNorm.some((v) => v !== null);
  const repsPoints = buildPolylinePoints(repsNorm, xPositions);

  const hasAnyMetric = hasDifficulty || hasWeight || hasReps;

  // ── Day bar setup ─────────────────────────────────────────────────────────

  const hasBars = dayBars.length > 0;
  const barsN = dayBars.length;
  const barViewW = VIEW_W;
  const barInnerW = barViewW - PADDING.left - PADDING.right;
  const slotW = barsN > 0 ? barInnerW / barsN : barInnerW;
  const barW = Math.max(2, Math.min(slotW * 0.7, 16));
  const maxAssigned = Math.max(1, ...dayBars.map((d) => d.assignedCount));
  const barInnerH = BAR_H - PADDING.top - PADDING.bottom;

  return (
    <div className={className}>
      {/* Window toggle */}
      <div className="mb-3 flex gap-1">
        <button
          type="button"
          onClick={() => onWindowChange?.(7)}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            windowDays === 7
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          7 дней
        </button>
        <button
          type="button"
          onClick={() => onWindowChange?.(30)}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            windowDays === 30
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          30 дней
        </button>
      </div>

      {/* Line chart */}
      {hasAnyMetric ? (
        <div className="mb-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Динамика метрик
          </p>
          <svg
            viewBox={`0 0 ${VIEW_W} ${CHART_H}`}
            className="w-full"
            style={{ height: 100 }}
            aria-label="Динамика метрик упражнения"
          >
            {/* Background grid */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const y =
                PADDING.top +
                (CHART_H - PADDING.top - PADDING.bottom) * (1 - pct / 100);
              return (
                <line
                  key={pct}
                  x1={PADDING.left}
                  y1={y}
                  x2={VIEW_W - PADDING.right}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth={0.5}
                />
              );
            })}

            {/* Severity line — red */}
            {hasDifficulty && difficultyPoints && (
              <polyline
                data-testid="line-severity"
                points={difficultyPoints}
                fill="none"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Weight line — blue */}
            {hasWeight && weightPoints && (
              <polyline
                data-testid="line-weight"
                points={weightPoints}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Reps×sets line — green */}
            {hasReps && repsPoints && (
              <polyline
                data-testid="line-reps"
                points={repsPoints}
                fill="none"
                stroke="#10b981"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </svg>
          {/* Legend */}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {hasDifficulty && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="inline-block h-1.5 w-4 rounded bg-red-500" />
                тяжесть
              </span>
            )}
            {hasWeight && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="inline-block h-1.5 w-4 rounded bg-blue-500" />
                доп.вес
              </span>
            )}
            {hasReps && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="inline-block h-1.5 w-4 rounded bg-emerald-500" />
                повт.×подх.
              </span>
            )}
          </div>
        </div>
      ) : metricPoints.length > 0 ? (
        <p className="mb-3 text-[10px] text-muted-foreground">
          Метрики не зафиксированы
        </p>
      ) : null}

      {/* Day activity bars */}
      {hasBars ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Активность по дням
          </p>
          <svg
            viewBox={`0 0 ${barViewW} ${BAR_H}`}
            className="w-full"
            style={{ height: 60 }}
            aria-label="Выполнение заданий по дням"
          >
            {dayBars.map((day, i) => {
              const slotX = PADDING.left + i * slotW;
              const cx = slotX + slotW / 2;
              const barX = cx - barW / 2;
              const barHeightPx =
                day.assignedCount === 0
                  ? 0
                  : Math.max(
                      2,
                      Math.round((day.assignedCount / maxAssigned) * barInnerH),
                    );
              const barY =
                PADDING.top + barInnerH - barHeightPx;
              const color = dayBarColor(day.assignedCount, day.doneCount);
              const label = formatLocalDate(day.localDate);
              const title = `${label}: ${day.doneCount}/${day.assignedCount}`;

              return (
                <g key={day.localDate} role="img" aria-label={title}>
                  <title>{title}</title>
                  {day.assignedCount > 0 && (
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={barHeightPx}
                      rx={1}
                      fill={color}
                      opacity={0.85}
                    />
                  )}
                  {/* Date label — only show every Nth for 30-day to avoid crowding */}
                  {(barsN <= 10 || i % Math.ceil(barsN / 10) === 0) && (
                    <text
                      x={cx}
                      y={PADDING.top + barInnerH + 10}
                      textAnchor="middle"
                      fontSize={8}
                      fill="#9ca3af"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* Legend */}
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-sm bg-green-500" />
              всё выполнено
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-sm bg-yellow-500" />
              частично
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-sm bg-gray-400" />
              нет данных
            </span>
          </div>
        </div>
      ) : null}

      {!hasAnyMetric && !hasBars ? (
        <p className="text-xs text-muted-foreground">Нет данных за период</p>
      ) : null}
    </div>
  );
}
