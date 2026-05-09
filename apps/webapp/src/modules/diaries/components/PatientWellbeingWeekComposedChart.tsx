"use client";

import { DateTime } from "luxon";
import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type YAxisTickContentProps,
} from "recharts";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import { wellbeingValue10ToRgb } from "@/modules/diaries/wellbeingWeekChartMoodColors";

/** Fallback, если нет точек «Среднее за день» (только instant). */
const STROKE_AREA_FALLBACK = "hsl(var(--patient-color-primary, 215 65% 38%))";
const FILL_AREA_FALLBACK = "hsl(var(--patient-color-primary-soft, 215 65% 38%) / 0.22)";
/** Верхняя граница «Среднее за день» поверх сегментной заливки — сглаженная, чтобы не было изломов у линии градиента. */
const STROKE_AGGREGATE_SMOOTH = "hsl(var(--patient-color-primary, 215 65% 38%))";
const TICK_FILL = "var(--patient-text-muted)";
const GRID_STROKE = "var(--patient-border)";

const SCATTER_FILL: Record<string, string> = {
  low: "hsl(38 85% 52%)",
  mid: "hsl(142 48% 42%)",
  high: "hsl(142 72% 34%)",
};

/** Полупрозрачная заливка под сплошным rgb(...) от {@link wellbeingValue10ToRgb}. */
function rgbFillSoft(rgb: string, alpha: number): string {
  const m = /^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/.exec(rgb.trim());
  if (!m) return rgb;
  return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
}

/** Легенда вне SVG: свои иконки (area + градиентная линия без точек). */
function PatientWellbeingWeekLegendContent() {
  const gid = useId().replace(/:/g, "");
  const aggFillId = `${gid}-wellbeingLegendAggFill`;
  const instStrokeId = `${gid}-wellbeingLegendInstStroke`;
  const primary = "hsl(var(--patient-color-primary, 215 65% 38%))";
  /** Как на графике агрегата: горизонтальный градиент между двумя полупрозрачными цветами шкалы 1–5. */
  const aggLegendFillLeft = rgbFillSoft(wellbeingValue10ToRgb(3), 0.28);
  const aggLegendFillRight = rgbFillSoft(wellbeingValue10ToRgb(5), 0.28);

  return (
    <div
      className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[10px] leading-[14px]"
      style={{ color: "var(--patient-text-secondary)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-[14px] w-[22px] shrink-0 items-center justify-center overflow-visible" aria-hidden>
          <svg width={22} height={14} viewBox="0 0 22 14" className="block">
            <defs>
              <linearGradient id={aggFillId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor={aggLegendFillLeft} />
                <stop offset="100%" stopColor={aggLegendFillRight} />
              </linearGradient>
            </defs>
            <path d="M0,13 L0,9 Q5.5,11 11,6.5 T22,5.5 L22,13 L0,13 Z" fill={`url(#${aggFillId})`} />
            <path
              d="M0,9 Q5.5,11 11,6.5 T22,5.5"
              fill="none"
              stroke={primary}
              strokeWidth={1.35}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>Среднее за день</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-[14px] w-[22px] shrink-0 items-center justify-center" aria-hidden>
          <svg width={22} height={14} viewBox="0 0 22 14" className="block">
            <defs>
              <linearGradient id={instStrokeId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                <stop offset="0%" stopColor="rgb(245,158,11)" />
                <stop offset="100%" stopColor="rgb(22,163,74)" />
              </linearGradient>
            </defs>
            <path
              d="M1,9 Q6.5,4 11,8 T21,5"
              fill="none"
              stroke={`url(#${instStrokeId})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>В течение дня</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center" aria-hidden>
          <svg width={14} height={14} viewBox="0 0 14 14" className="block">
            <circle cx={7} cy={7} r={4.5} fill={SCATTER_FILL.mid} stroke="var(--patient-card-bg)" strokeWidth={1} />
          </svg>
        </span>
        <span>После разминки</span>
      </div>
    </div>
  );
}

export type PatientWellbeingWeekComposedChartProps = {
  model: WellbeingWeekChartModel;
  /** IANA для подписей оси X */
  iana: string;
};

type AggPt = { x: number; y: number };

/**
 * Участки «Среднее за день»: заливка — горизонтальный градиент между цветом оценки слева и справа (дискретные оттенки 1–5).
 * По вертикали внутри участка цвет не меняется.
 */
function buildAggregateSolidSegments(
  pts: AggPt[],
  weekStartMs: number,
  chartEndMs: number,
): { key: string; data: [AggPt, AggPt]; fillLeft: string; fillRight: string }[] {
  if (pts.length === 0) return [];
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const out: { key: string; data: [AggPt, AggPt]; fillLeft: string; fillRight: string }[] = [];
  let left = weekStartMs;
  let leftY = sorted[0]!.y;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (p.x > left) {
      const cLeft = wellbeingValue10ToRgb(leftY);
      const cRight = wellbeingValue10ToRgb(p.y);
      out.push({
        key: `agg-${left}-${p.x}`,
        data: [
          { x: left, y: leftY },
          { x: p.x, y: p.y },
        ],
        fillLeft: rgbFillSoft(cLeft, 0.28),
        fillRight: rgbFillSoft(cRight, 0.28),
      });
    }
    left = p.x;
    leftY = p.y;
  }
  if (chartEndMs > left) {
    const c = wellbeingValue10ToRgb(leftY);
    const soft = rgbFillSoft(c, 0.28);
    out.push({
      key: `agg-tail-${left}-${chartEndMs}`,
      data: [
        { x: left, y: leftY },
        { x: chartEndMs, y: leftY },
      ],
      fillLeft: soft,
      fillRight: soft,
    });
  }
  return out;
}

function weekDayTicks(weekStartMs: number, iana: string): number[] {
  const ticks: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const ms = DateTime.fromMillis(weekStartMs, { zone: iana }).plus({ days: i }).startOf("day").toMillis();
    ticks.push(ms);
  }
  return ticks;
}

/** Отрезки линии instant: градиент по stroke от цвета левой точки к правой (шкала самочувствия 1–5). */
function buildInstantStrokeSegments(pts: AggPt[]): { key: string; data: [AggPt, AggPt]; colorLeft: string; colorRight: string }[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const out: { key: string; data: [AggPt, AggPt]; colorLeft: string; colorRight: string }[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    out.push({
      key: `inst-${i}-${a.x}-${b.x}`,
      data: [a, b],
      colorLeft: wellbeingValue10ToRgb(a.y),
      colorRight: wellbeingValue10ToRgb(b.y),
    });
  }
  return out;
}

/**
 * Обрезает серию по времени: точки с x > endMs отбрасываются; если отрезок пересекает endMs — добавляется точка на границе (для линии instant).
 */
function clipSeriesAtEndMs(pts: AggPt[], endMs: number): AggPt[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const out: AggPt[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (p.x <= endMs) {
      out.push(p);
      continue;
    }
    const prev = sorted[i - 1];
    if (prev && prev.x < endMs) {
      const span = p.x - prev.x;
      const u = span === 0 ? 0 : (endMs - prev.x) / span;
      out.push({ x: endMs, y: prev.y + u * (p.y - prev.y) });
    }
    break;
  }
  return out;
}

/** Вертикальная шкала самочувствия — 1–5 (ноль не допускается шкалой чек-ина). */
const Y_AXIS_MIN = 1;
const Y_AXIS_MAX = 5;
const Y_AXIS_TICKS = [1, 5] as const;

/** Отступ слева: подписи 1/5 у левого края контейнера, вертикаль сетки — чуть правее. */
const Y_AXIS_LABEL_GUTTER_PX = 14;

/** Подписи 1/5 у левого края области графика (внутри {@link Y_AXIS_LABEL_GUTTER_PX}). */
function wellbeingYAxisTick(props: YAxisTickContentProps) {
  const y = Number(props.y);
  const v = props.payload?.value;
  if (v == null) return null;
  return (
    <text x={4} y={y} dy={4} textAnchor="start" fill={TICK_FILL} fontSize={10}>
      {String(v)}
    </text>
  );
}

/** Плавная полилиния через отметки (Catmull–Rom); y в пределах шкалы графика. */
function smoothInstantPolyline(sortedInput: AggPt[], stepsPerSpan: number): AggPt[] {
  const sorted = [...sortedInput].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  if (n <= 1) return sorted;

  const clampY = (y: number) => Math.max(Y_AXIS_MIN, Math.min(Y_AXIS_MAX, y));
  const steps = Math.max(6, Math.min(24, Math.round(stepsPerSpan)));
  const get = (idx: number): AggPt => sorted[Math.max(0, Math.min(n - 1, idx))]!;

  const out: AggPt[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let s = 0; s <= steps; s += 1) {
      if (i > 0 && s === 0) continue;
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      let x =
        0.5 *
        (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      let y =
        0.5 *
        (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      y = clampY(y);
      if (out.length > 0 && x <= out[out.length - 1]!.x) {
        x = out[out.length - 1]!.x + 1e-3;
      }
      out.push({ x, y });
    }
  }
  return out;
}

export default function PatientWellbeingWeekComposedChart({ model, iana }: PatientWellbeingWeekComposedChartProps) {
  const gradPrefix = useId().replace(/:/g, "");
  const { aggregateSeries, instantSeries, warmupScatter, weekStartMs, weekEndMs } = model;
  const nowMs = DateTime.now().setZone(iana).toMillis();
  const chartEndMs = Math.max(weekStartMs, Math.min(weekEndMs, nowMs));
  const ticks = weekDayTicks(weekStartMs, iana);
  const aggDataRaw = aggregateSeries.map((p) => ({ x: p.t, y: p.v }));
  const aggData = aggDataRaw.filter((p) => p.x <= chartEndMs);
  const aggregateSegments = buildAggregateSolidSegments(aggData, weekStartMs, chartEndMs);
  const instDataRaw = instantSeries.map((p) => ({ x: p.t, y: p.v }));
  const instData = clipSeriesAtEndMs(instDataRaw, chartEndMs);
  const instSmooth = instData.length > 1 ? smoothInstantPolyline(instData, 10) : instData;
  const instantStrokeSegments = buildInstantStrokeSegments(instSmooth);
  const scatterData = warmupScatter
    .map((p) => ({ x: p.t, y: p.v, band: p.band }))
    .filter((p) => p.x <= chartEndMs);

  const fmtWeekdayDay = (ms: number) =>
    DateTime.fromMillis(ms, { zone: iana }).setLocale("ru").toFormat("ccc d");

  const fmtTooltipLabel = (ms: number) =>
    DateTime.fromMillis(ms, { zone: iana }).setLocale("ru").toFormat("ccc d MMM, HH:mm");

  return (
    <div className="h-[220px] w-full min-w-0 overflow-x-visible pb-2 [&_.recharts-wrapper]:overflow-visible">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 0, left: Y_AXIS_LABEL_GUTTER_PX, bottom: 8 }}>
          <defs>
            {aggregateSegments.map((seg, idx) => (
              <linearGradient
                key={seg.key}
                id={`${gradPrefix}-aggFill-${idx}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor={seg.fillLeft} />
                <stop offset="100%" stopColor={seg.fillRight} />
              </linearGradient>
            ))}
            {instantStrokeSegments.map((seg, idx) => (
              <linearGradient
                key={seg.key}
                id={`${gradPrefix}-instStroke-${idx}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor={seg.colorLeft} stopOpacity={0.85} />
                <stop offset="100%" stopColor={seg.colorRight} stopOpacity={0.85} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" strokeWidth={0.5} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[weekStartMs, weekEndMs]}
            scale="linear"
            allowDataOverflow
            ticks={ticks}
            tick={{ fontSize: 11, fill: TICK_FILL }}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE, strokeWidth: 0.5 }}
            tickFormatter={(ms: number) => fmtWeekdayDay(ms)}
          />
          <YAxis
            domain={[Y_AXIS_MIN, Y_AXIS_MAX]}
            width={0}
            ticks={[...Y_AXIS_TICKS]}
            tick={wellbeingYAxisTick}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const v = typeof value === "number" ? value : Number(value);
              const n = typeof name === "string" ? name : String(name ?? "");
              const labels: Record<string, string> = {
                aggregate: "Среднее за день",
                instant: "В течение дня",
                warmup: "После разминки",
              };
              if (value === undefined || value === null || !Number.isFinite(v)) {
                return ["—", labels[n] ?? n];
              }
              return [`${v.toFixed(1)}`, labels[n] ?? n];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { x?: number } | undefined;
              const x = p?.x;
              if (x == null) return "";
              return fmtTooltipLabel(x);
            }}
            contentStyle={{
              background: "var(--patient-card-bg)",
              border: "1px solid var(--patient-border)",
              borderRadius: "4px",
              padding: "4px 6px",
              fontSize: "10px",
              lineHeight: "13px",
              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.06)",
            }}
            labelStyle={{
              fontSize: "10px",
              lineHeight: "13px",
              marginBottom: "2px",
              fontWeight: 600,
              color: "var(--patient-text-primary)",
            }}
            itemStyle={{
              fontSize: "10px",
              lineHeight: "13px",
              paddingTop: "1px",
              paddingBottom: "1px",
              color: "var(--patient-text-secondary)",
            }}
          />
          <Legend
            verticalAlign="bottom"
            align="left"
            layout="horizontal"
            wrapperStyle={{
              paddingTop: 8,
              paddingLeft: Y_AXIS_LABEL_GUTTER_PX,
              width: "100%",
            }}
            content={PatientWellbeingWeekLegendContent}
          />
          {aggregateSegments.map((seg, idx) => (
            <Area
              key={seg.key}
              data={seg.data}
              type="linear"
              dataKey="y"
              baseLine={Y_AXIS_MIN}
              name={idx === 0 ? "aggregate" : undefined}
              legendType="none"
              tooltipType="none"
              stroke="none"
              fill={`url(#${gradPrefix}-aggFill-${idx})`}
              dot={false}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
          {aggData.length > 0 ?
            <>
              <Line
                data={aggData}
                type="monotone"
                dataKey="y"
                legendType="none"
                tooltipType="none"
                stroke={STROKE_AGGREGATE_SMOOTH}
                strokeWidth={2}
                strokeOpacity={0.88}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                data={aggData}
                type="monotone"
                dataKey="y"
                name="aggregate"
                legendType="none"
                stroke="transparent"
                strokeWidth={22}
                dot={false}
                activeDot={{ r: 5, stroke: "var(--patient-color-primary)", fill: "var(--patient-card-bg)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </>
          : (
            <Area
              data={aggData}
              type="monotone"
              dataKey="y"
              baseLine={Y_AXIS_MIN}
              name="aggregate"
              legendType="none"
              stroke={STROKE_AREA_FALLBACK}
              strokeWidth={2.5}
              fill={FILL_AREA_FALLBACK}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          {instData.length === 1 ?
            <Line
              data={instData}
              type="linear"
              dataKey="y"
              name="instant"
              legendType="none"
              stroke="transparent"
              strokeWidth={18}
              strokeOpacity={1}
              dot={{
                r: 4,
                fill: wellbeingValue10ToRgb(instData[0]!.y),
                stroke: "var(--patient-card-bg)",
                strokeWidth: 1,
              }}
              activeDot={{ r: 5, stroke: "var(--patient-color-primary)", fill: "var(--patient-card-bg)" }}
              connectNulls={false}
              isAnimationActive={false}
            />
          : instData.length > 1 ?
            <>
              {instantStrokeSegments.map((seg, idx) => (
                <Line
                  key={seg.key}
                  data={seg.data}
                  type="linear"
                  dataKey="y"
                  name={idx === 0 ? "instant" : undefined}
                  legendType="none"
                  tooltipType="none"
                  stroke={`url(#${gradPrefix}-instStroke-${idx})`}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
              <Line
                data={instSmooth}
                type="linear"
                dataKey="y"
                name="instant"
                legendType="none"
                stroke="transparent"
                strokeWidth={18}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </>
          : null}
          <Scatter
            data={scatterData}
            dataKey="y"
            name="warmup"
            legendType="none"
            fill={SCATTER_FILL.mid}
            line={false}
            zIndex={10}
            shape={(props: {
              cx?: number;
              cy?: number;
              payload?: { band?: string };
            }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null) return null;
              const band = payload?.band ?? "mid";
              const fill = SCATTER_FILL[band] ?? SCATTER_FILL.mid;
              return (
                <circle cx={cx} cy={cy} r={5} fill={fill} stroke="var(--patient-card-bg)" strokeWidth={1} />
              );
            }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
