"use client";

/**
 * ExerciseExecutionGraph — SVG-based two-panel chart for CMT-01..04.
 *
 * Top panel: 3-line polyline chart (difficulty=red, weightKg=blue, reps×sets=green).
 *   Lines are relative (normalised to [0..100] independently), may cross.
 * Bottom panel: per-day activity bars (green=all-done, yellow=partial, gray=none).
 *   Dates shown on horizontal axis.
 *
 * CMT-03: hover over any day bar → rich tooltip with exact metrics for that day.
 * CMT-04: reusable (props-driven, no hard-coded patient).
 *
 * Pure SVG + React state — no recharts dependency.
 */

import { useState } from "react";
import type { ExerciseMetricPoint } from "./ExerciseMicroChart";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_W = 400;
const CHART_H = 110;
const BAR_H = 70;
const PADDING = { top: 8, right: 12, bottom: 20, left: 12 };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize a series of numbers to [0..100]. Returns null-passthrough for nulls. */
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

/** Convert difficulty string to 0..100 ordinal. */
function difficultyToNumeric(d: string | null): number | null {
  if (d === "easy") return 33;
  if (d === "medium") return 66;
  if (d === "hard") return 100;
  return null;
}

/** Build SVG polyline `points` attribute string. */
function buildPolylinePoints(
  normalizedValues: (number | null)[],
  xPositions: number[],
): string {
  const pts: string[] = [];
  const innerH = CHART_H - PADDING.top - PADDING.bottom;
  for (let i = 0; i < normalizedValues.length; i++) {
    const v = normalizedValues[i];
    if (v === null) continue;
    const x = xPositions[i];
    const y = PADDING.top + innerH * (1 - v / 100);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

/** Build list of [x, y] pairs for dot rendering. */
function buildDotPositions(
  normalizedValues: (number | null)[],
  xPositions: number[],
): { x: number; y: number }[] {
  const innerH = CHART_H - PADDING.top - PADDING.bottom;
  return normalizedValues
    .map((v, i) => {
      if (v === null) return null;
      return { x: xPositions[i], y: PADDING.top + innerH * (1 - v / 100) };
    })
    .filter((p): p is { x: number; y: number } => p !== null);
}

/** Format YYYY-MM-DD → DD.MM */
function formatLocalDate(d: string): string {
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}.${parts[1]}`;
}

/** Format ISO timestamp → DD.MM */
function formatIsoDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}`;
  } catch {
    return iso;
  }
}

/** Colour of a day bar. */
function dayBarColor(assigned: number, done: number): string {
  if (assigned === 0) return "#9ca3af"; // gray-400
  if (done >= assigned) return "#22c55e"; // green-500
  if (done > 0) return "#eab308"; // yellow-500
  return "#9ca3af"; // gray-400
}

/** Human-readable difficulty label (RU). */
function difficultyLabel(d: string | null): string {
  if (d === "easy") return "легко";
  if (d === "medium") return "норм.";
  if (d === "hard") return "тяжело";
  return "—";
}

// ── Hover tooltip type ────────────────────────────────────────────────────────

type HoveredDay = {
  dayBar: DayBar;
  metrics: ExerciseMetricPoint[];
  /** Pixel offset (left %) for tooltip anchor, 0..1. */
  xFraction: number;
};

// ── Main component ────────────────────────────────────────────────────────────

export function ExerciseExecutionGraph({
  metricPoints,
  dayBars,
  windowDays = 7,
  onWindowChange,
  className,
}: ExerciseExecutionGraphProps) {
  const [hoveredDay, setHoveredDay] = useState<HoveredDay | null>(null);

  const ordered = [...metricPoints].sort((a, b) => a.at.localeCompare(b.at));

  // ── Line chart setup ──────────────────────────────────────────────────────

  const n = ordered.length;
  const innerW = VIEW_W - PADDING.left - PADDING.right;

  const xPositions: number[] =
    n <= 1
      ? [PADDING.left + innerW / 2]
      : ordered.map((_, i) => PADDING.left + (i / (n - 1)) * innerW);

  // Severity (difficulty) series
  const difficultyRaw = ordered.map((p) => difficultyToNumeric(p.difficulty));
  const difficultyNorm = normalizeNumericSeries(difficultyRaw);
  const hasDifficulty = difficultyNorm.some((v) => v !== null);
  const difficultyPolyline = buildPolylinePoints(difficultyNorm, xPositions);
  const difficultyDots = buildDotPositions(difficultyNorm, xPositions);

  // Weight series
  const weightRaw = ordered.map((p) => p.weightKg);
  const weightNorm = normalizeNumericSeries(weightRaw);
  const hasWeight = weightNorm.some((v) => v !== null);
  const weightPolyline = buildPolylinePoints(weightNorm, xPositions);
  const weightDots = buildDotPositions(weightNorm, xPositions);

  // Reps×sets series
  const repsRaw = ordered.map((p) => {
    if (p.reps === null) return null;
    return p.sets !== null ? p.reps * p.sets : p.reps;
  });
  const repsNorm = normalizeNumericSeries(repsRaw);
  const hasReps = repsNorm.some((v) => v !== null);
  const repsPolyline = buildPolylinePoints(repsNorm, xPositions);
  const repsDots = buildDotPositions(repsNorm, xPositions);

  const hasAnyMetric = hasDifficulty || hasWeight || hasReps;

  // ── Day bar setup ─────────────────────────────────────────────────────────

  const hasBars = dayBars.length > 0;
  const barsN = dayBars.length;
  const barInnerW = VIEW_W - PADDING.left - PADDING.right;
  const slotW = barsN > 0 ? barInnerW / barsN : barInnerW;
  const barW = Math.max(2, Math.min(slotW * 0.65, 18));
  const maxAssigned = Math.max(1, ...dayBars.map((d) => d.assignedCount));
  const barInnerH = BAR_H - PADDING.top - PADDING.bottom;

  // ── Hover helpers ─────────────────────────────────────────────────────────

  const handleDayHover = (day: DayBar, i: number) => {
    const isoDate = day.localDate; // YYYY-MM-DD
    // Collect metric points for that calendar day
    const metricsForDay = ordered.filter((p) => {
      try {
        const d = new Date(p.at);
        const pDate = d.toISOString().slice(0, 10);
        return pDate === isoDate;
      } catch {
        return false;
      }
    });
    const xFraction = (PADDING.left + i * slotW + slotW / 2) / VIEW_W;
    setHoveredDay({ dayBar: day, metrics: metricsForDay, xFraction });
  };

  return (
    <div className={className}>
      {/* Window toggle */}
      <div className="mb-3 flex gap-1">
        {([7, 30] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onWindowChange?.(d)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              windowDays === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {d} дней
          </button>
        ))}
      </div>

      {/* ── Line chart ── */}
      {hasAnyMetric ? (
        <div className="mb-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Динамика метрик
          </p>
          <svg
            viewBox={`0 0 ${VIEW_W} ${CHART_H}`}
            className="w-full"
            style={{ height: 110 }}
            aria-label="Динамика метрик упражнения"
          >
            {/* Background grid lines */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const innerH = CHART_H - PADDING.top - PADDING.bottom;
              const y = PADDING.top + innerH * (1 - pct / 100);
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
            {hasDifficulty && difficultyPolyline && (
              <>
                <polyline
                  data-testid="line-severity"
                  points={difficultyPolyline}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {difficultyDots.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill="#ef4444" />
                ))}
              </>
            )}

            {/* Weight line — blue */}
            {hasWeight && weightPolyline && (
              <>
                <polyline
                  data-testid="line-weight"
                  points={weightPolyline}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {weightDots.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill="#3b82f6" />
                ))}
              </>
            )}

            {/* Reps×sets line — emerald */}
            {hasReps && repsPolyline && (
              <>
                <polyline
                  data-testid="line-reps"
                  points={repsPolyline}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {repsDots.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={2.5} fill="#10b981" />
                ))}
              </>
            )}

            {/* X-axis date labels for metric points */}
            {ordered.map((p, i) => {
              const x = xPositions[i];
              // Only show every Nth label to avoid crowding
              const show = n <= 7 || i % Math.ceil(n / 7) === 0 || i === n - 1;
              if (!show) return null;
              return (
                <text
                  key={p.at}
                  x={x}
                  y={CHART_H - 4}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#9ca3af"
                >
                  {formatIsoDateShort(p.at)}
                </text>
              );
            })}
          </svg>
          {/* Legend */}
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
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

      {/* ── Day activity bars (CMT-02) with hover tooltip (CMT-03) ── */}
      {hasBars ? (
        <div
          className="relative"
          onMouseLeave={() => setHoveredDay(null)}
        >
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Активность по дням
          </p>

          {/* Hover tooltip (CMT-03: detailed numeric expansion) */}
          {hoveredDay && (
            <div
              className="pointer-events-none absolute z-20 w-40 rounded border border-border bg-popover p-2 text-[10px] shadow-md"
              style={{
                bottom: "calc(100% - 2px)",
                left: `clamp(0px, calc(${(hoveredDay.xFraction * 100).toFixed(1)}% - 5rem), calc(100% - 10rem))`,
              }}
            >
              <p className="mb-1 font-semibold text-foreground">
                {formatLocalDate(hoveredDay.dayBar.localDate)}
              </p>
              <p className="text-muted-foreground">
                Выполнено: {hoveredDay.dayBar.doneCount} / {hoveredDay.dayBar.assignedCount}
              </p>
              {hoveredDay.metrics.length > 0 ? (
                <div className="mt-1 space-y-0.5 border-t border-border pt-1">
                  {hoveredDay.metrics.map((m, mi) => (
                    <div key={mi} className="flex flex-col gap-0">
                      {m.reps !== null && (
                        <span className="text-emerald-600">повт.: {m.reps}{m.sets !== null ? ` × ${m.sets} подх.` : ""}</span>
                      )}
                      {m.weightKg !== null && (
                        <span className="text-blue-600">вес: {m.weightKg} кг</span>
                      )}
                      {m.difficulty !== null && (
                        <span className="text-red-500">тяжесть: {difficultyLabel(m.difficulty)}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          <svg
            viewBox={`0 0 ${VIEW_W} ${BAR_H}`}
            className="w-full"
            style={{ height: 70 }}
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
              const barY = PADDING.top + barInnerH - barHeightPx;
              const color = dayBarColor(day.assignedCount, day.doneCount);
              const label = formatLocalDate(day.localDate);
              const title = `${label}: ${day.doneCount}/${day.assignedCount}`;
              const isHovered = hoveredDay?.dayBar.localDate === day.localDate;

              return (
                <g
                  key={day.localDate}
                  role="img"
                  aria-label={title}
                  onMouseEnter={() => handleDayHover(day, i)}
                  style={{ cursor: "default" }}
                >
                  <title>{title}</title>
                  {/* Hover hit area (wider than the bar) */}
                  <rect
                    x={slotX}
                    y={PADDING.top}
                    width={slotW}
                    height={barInnerH + PADDING.bottom}
                    fill="transparent"
                  />
                  {day.assignedCount > 0 && (
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={barHeightPx}
                      rx={2}
                      fill={color}
                      opacity={isHovered ? 1 : 0.85}
                      stroke={isHovered ? color : "none"}
                      strokeWidth={isHovered ? 1 : 0}
                    />
                  )}
                  {day.assignedCount === 0 && (
                    <rect
                      x={barX}
                      y={PADDING.top + barInnerH - 2}
                      width={barW}
                      height={2}
                      rx={1}
                      fill="#e5e7eb"
                    />
                  )}
                  {/* Date label */}
                  {(barsN <= 10 || i % Math.ceil(barsN / 10) === 0 || i === barsN - 1) && (
                    <text
                      x={cx}
                      y={PADDING.top + barInnerH + 12}
                      textAnchor="middle"
                      fontSize={7}
                      fill={isHovered ? "#6b7280" : "#9ca3af"}
                      fontWeight={isHovered ? "600" : "normal"}
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
