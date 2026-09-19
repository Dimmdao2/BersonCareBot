'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type {
  ExerciseHistoryComment,
  ExerciseMetricPoint,
  LfkPostSessionDifficulty,
} from '@/modules/treatment-program/types';
import { cn } from '@/lib/utils';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { doctorMetaTextClass } from '@/shared/ui/doctor/doctorVisual';

type HistoryResponse = {
  ok?: boolean;
  iana?: string;
  points?: ExerciseMetricPoint[];
  comments?: ExerciseHistoryComment[];
};

type HistoryState =
  | { key: string; state: 'loading'; points: []; comments: []; iana: null }
  | { key: string; state: 'empty'; points: []; comments: []; iana: null }
  | { key: string; state: 'error'; points: []; comments: []; iana: null }
  | {
      key: string;
      state: 'ready';
      points: ExerciseMetricPoint[];
      comments: ExerciseHistoryComment[];
      iana: string;
    };

type JournalDay = {
  date: string;
  completions: ExerciseMetricPoint[];
  comments: ExerciseHistoryComment[];
};

type ChartDay = JournalDay & {
  chartKey: string;
  volume: number | null;
  pain010: number | null;
  painLine010: number | null;
  difficulty: LfkPostSessionDifficulty | null;
  lastWeightKg: number | null;
  weightChangeLabel: string | null;
  painScale: number;
};

const difficultyLabel: Record<LfkPostSessionDifficulty, string> = {
  easy: 'Легко',
  medium: 'Средне',
  hard: 'Тяжело',
};

const difficultyColor: Record<LfkPostSessionDifficulty | 'none', string> = {
  none: 'var(--doctor-exercise-difficulty-none)',
  easy: 'var(--doctor-exercise-difficulty-easy)',
  medium: 'var(--doctor-exercise-difficulty-medium)',
  hard: 'var(--doctor-exercise-difficulty-hard)',
};

const painToneClass = [
  'bg-[var(--doctor-exercise-pain-0)]',
  'bg-[var(--doctor-exercise-pain-1)]',
  'bg-[var(--doctor-exercise-pain-2)]',
  'bg-[var(--doctor-exercise-pain-3)]',
  'bg-[var(--doctor-exercise-pain-4)]',
  'bg-[var(--doctor-exercise-pain-5)]',
  'bg-[var(--doctor-exercise-pain-6)]',
  'bg-[var(--doctor-exercise-pain-7)]',
  'bg-[var(--doctor-exercise-pain-8)]',
  'bg-[var(--doctor-exercise-pain-9)]',
  'bg-[var(--doctor-exercise-pain-10)]',
] as const;

function parseStoredDate(value: string): DateTime {
  const iso = DateTime.fromISO(value, { setZone: true });
  return iso.isValid ? iso : DateTime.fromSQL(value, { setZone: true });
}

function localDateKey(iso: string, iana: string): string | null {
  const date = parseStoredDate(iso).setZone(iana);
  return date.isValid ? date.toISODate() : null;
}

function dateDayLabel(date: string): string {
  return DateTime.fromISO(date, { zone: 'utc' }).setLocale('ru').toFormat('d');
}

function weekdayLabel(date: string): string {
  return DateTime.fromISO(date, { zone: 'utc' })
    .setLocale('ru')
    .toFormat('ccc')
    .replace('.', '')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function monthLabel(date: string): string {
  const label = DateTime.fromISO(date, { zone: 'utc' }).setLocale('ru').toFormat('LLLL yyyy');
  return label.replace(/^./, (letter) => letter.toUpperCase());
}

function formatWeight(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} кг`;
}

function formatRepsSets(point: ExerciseMetricPoint): string {
  if (point.reps === null || point.sets === null) return '—';
  return `${point.reps} × ${point.sets}`;
}

function painClass(value: number): string {
  return cn(
    painToneClass[value] ?? painToneClass[0],
    value >= 8 ? 'text-white' : 'text-foreground',
  );
}

function addDays(date: string, amount: number): string {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days: amount }).toISODate()!;
}

function journalDaysFromHistory(
  points: ExerciseMetricPoint[],
  comments: ExerciseHistoryComment[],
  iana: string,
): JournalDay[] {
  const keyedPoints = points.flatMap((point) => {
    const date = localDateKey(point.at, iana);
    return date ? [{ date, point }] : [];
  });
  const keyedComments = comments.flatMap((comment) => {
    const date = localDateKey(comment.at, iana);
    return date ? [{ date, comment }] : [];
  });
  const dates = [
    ...new Set([
      ...keyedPoints.map((item) => item.date),
      ...keyedComments.map((item) => item.date),
    ]),
  ].sort();
  if (dates.length === 0) return [];

  const pointMap = new Map<string, ExerciseMetricPoint[]>();
  for (const item of keyedPoints) {
    const current = pointMap.get(item.date) ?? [];
    current.push(item.point);
    pointMap.set(item.date, current);
  }
  const commentMap = new Map<string, ExerciseHistoryComment[]>();
  for (const item of keyedComments) {
    const current = commentMap.get(item.date) ?? [];
    current.push(item.comment);
    commentMap.set(item.date, current);
  }
  return dates.map((date) => ({
    date,
    completions: [...(pointMap.get(date) ?? [])].sort((a, b) => a.at.localeCompare(b.at)),
    comments: [...(commentMap.get(date) ?? [])].sort((a, b) => a.at.localeCompare(b.at)),
  }));
}

function calendarDaysFromJournal(days: JournalDay[]): JournalDay[] {
  const firstDate = days[0]?.date;
  const lastDate = days[days.length - 1]?.date;
  if (!firstDate || !lastDate) return [];
  const byDate = new Map(days.map((day) => [day.date, day]));
  const calendarDays: JournalDay[] = [];
  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    calendarDays.push(byDate.get(date) ?? { date, completions: [], comments: [] });
  }
  return calendarDays;
}

function chartDaysFromJournal(days: JournalDay[]): ChartDay[] {
  let previousWeight: number | null = null;
  const chartDays = days.flatMap((day) => {
    const entries = day.completions.length > 0 ? day.completions : [null];
    return entries.map((completion, completionIndex) => {
      const lastWeightKg = completion?.weightKg ?? null;
      const delta =
        lastWeightKg !== null && previousWeight !== null ? lastWeightKg - previousWeight : null;
      if (lastWeightKg !== null) previousWeight = lastWeightKg;
      return {
        ...day,
        chartKey: completion?.completionId ?? `${day.date}-${completionIndex}`,
        completions: completion ? [completion] : [],
        volume:
          completion?.reps !== null &&
          completion?.reps !== undefined &&
          completion.sets !== null &&
          completion.sets !== undefined
            ? completion.reps * completion.sets
            : null,
        pain010: completion?.pain010 ?? null,
        painLine010: completion?.pain010 ?? null,
        difficulty: completion?.difficulty ?? null,
        lastWeightKg,
        weightChangeLabel: delta && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}\u00a0кг` : null,
        // Keeps the fixed clinical 0–10 axis and its guides visible even before pain is entered.
        painScale: 0,
      };
    });
  });
  let previousPainIndex: number | null = null;
  for (let index = 0; index < chartDays.length; index += 1) {
    const currentPain = chartDays[index]?.pain010;
    if (currentPain === null || currentPain === undefined) continue;
    const previousPainDay =
      previousPainIndex === null ? null : (chartDays[previousPainIndex]?.date ?? null);
    const currentDay = chartDays[index]?.date ?? null;
    const dayGap =
      previousPainDay && currentDay
        ? DateTime.fromISO(currentDay).diff(DateTime.fromISO(previousPainDay), 'days').days
        : Number.POSITIVE_INFINITY;
    if (previousPainIndex !== null && dayGap <= 4) {
      const previousPain = chartDays[previousPainIndex]?.pain010;
      if (previousPain !== null && previousPain !== undefined) {
        for (let bridgeIndex = previousPainIndex + 1; bridgeIndex < index; bridgeIndex += 1) {
          const ratio = (bridgeIndex - previousPainIndex) / (index - previousPainIndex);
          chartDays[bridgeIndex]!.painLine010 = previousPain + (currentPain - previousPain) * ratio;
        }
      }
    }
    previousPainIndex = index;
  }
  return chartDays;
}

function volumeAxisTicks(days: ChartDay[]): number[] {
  const largestVolume = Math.max(
    0,
    ...days.flatMap((day) => (day.volume === null ? [] : [day.volume])),
  );
  const targetStep = Math.max(1, largestVolume / 3);
  const exponent = 10 ** Math.floor(Math.log10(targetStep));
  const normalized = targetStep / exponent;
  const step =
    (normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10) * exponent;
  return [0, step, step * 2, step * 3];
}

function ChartSideAxis({
  values,
  side,
  color,
}: {
  values: number[];
  side: 'left' | 'right';
  color: string;
}) {
  const isLeft = side === 'left';
  return (
    <div className="relative h-[264px] w-4 shrink-0" aria-hidden="true">
      <span
        className={cn('absolute top-[18px] bottom-[66px] w-px', isLeft ? 'right-0' : 'left-0')}
        style={{ backgroundColor: color }}
      />
      {values.map((value, index) => (
        <span
          key={value}
          className={cn(
            'absolute z-10 -translate-y-1/2 text-[10px] leading-none tabular-nums',
            isLeft ? 'right-1 text-right' : 'left-1 text-left',
            !isLeft && value === 10 && '-translate-x-[3px]',
          )}
          style={{ top: `${18 + (index / (values.length - 1)) * 180}px`, color }}
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function ChartDateTick({
  x = 0,
  y = 0,
  payload,
  entriesByKey,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  entriesByKey: Map<string, ChartDay>;
}) {
  const chartKey = typeof payload?.value === 'string' ? payload.value : null;
  const day = chartKey ? entriesByKey.get(chartKey) : null;
  if (!day) return null;
  const complete = day.completions.length > 0;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        y={13}
        textAnchor="middle"
        fill={
          complete
            ? 'var(--doctor-exercise-completion-text)'
            : 'var(--doctor-exercise-date-inactive)'
        }
        fontSize={12}
        fontWeight={complete ? 600 : 400}
      >
        {dateDayLabel(day.date)}
      </text>
      <text y={28} textAnchor="middle" fill="var(--doctor-exercise-date-inactive)" fontSize={10}>
        {weekdayLabel(day.date)}
      </text>
      {complete ? <circle cy={40} r={2.5} fill="var(--doctor-exercise-completion-dot)" /> : null}
    </g>
  );
}

function ExerciseChartTooltip({
  active,
  payload = [],
}: Partial<TooltipContentProps<number, string>>) {
  const chartDay = payload[0]?.payload as ChartDay | undefined;
  if (!active || !chartDay) return null;
  const latest = chartDay.completions[chartDay.completions.length - 1] ?? null;
  return (
    <div className="min-w-36 rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">
        {dateDayLabel(chartDay.date)} {weekdayLabel(chartDay.date)}
      </p>
      {latest ? (
        <div className="mt-1 space-y-0.5 text-muted-foreground">
          <p>{formatRepsSets(latest)}</p>
          {chartDay.pain010 !== null ? <p>Боль {chartDay.pain010}</p> : null}
          {chartDay.lastWeightKg !== null ? <p>{formatWeight(chartDay.lastWeightKg)}</p> : null}
        </div>
      ) : (
        <p className="mt-1 text-muted-foreground">Нет выполнения</p>
      )}
    </div>
  );
}

function ExerciseDynamicsChart({ days }: { days: ChartDay[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [chartRenderKey, setChartRenderKey] = useState(0);
  const width = Math.max(520, days.length * 40);
  const entriesByKey = new Map(days.map((day) => [day.chartKey, day]));
  const [visibleRange, setVisibleRange] = useState(() => ({
    start: Math.max(0, days.length - 8),
    end: days.length,
  }));
  const hasValues = days.some((day) => day.completions.length > 0);
  const visibleDays = days.slice(visibleRange.start, visibleRange.end);
  const visibleMonthDate =
    visibleDays[Math.floor(visibleDays.length / 2)]?.date ?? days.at(-1)?.date ?? null;
  const volumeTicks = volumeAxisTicks(visibleDays.length > 0 ? visibleDays : days.slice(-8));

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame: number | null = null;
    const syncVisibleRange = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const columnWidth = width / Math.max(1, days.length);
        const start = Math.max(0, Math.floor(container.scrollLeft / columnWidth));
        const end = Math.min(
          days.length,
          Math.max(
            start + 1,
            Math.ceil((container.scrollLeft + container.clientWidth) / columnWidth),
          ),
        );
        setVisibleRange((current) =>
          current.start === start && current.end === end ? current : { start, end },
        );
      });
    };
    const resizeObserver = new ResizeObserver(syncVisibleRange);
    container.addEventListener('scroll', syncVisibleRange, { passive: true });
    resizeObserver.observe(container);
    container.scrollLeft = container.scrollWidth;
    syncVisibleRange();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      container.removeEventListener('scroll', syncVisibleRange);
      resizeObserver.disconnect();
    };
  }, [days.length, width]);

  useEffect(() => {
    const dismissTooltipOutsideChart = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || scrollRef.current?.contains(target)) return;
      setChartRenderKey((current) => current + 1);
    };
    document.addEventListener('pointerdown', dismissTooltipOutsideChart);
    return () => document.removeEventListener('pointerdown', dismissTooltipOutsideChart);
  }, []);

  return (
    <section className="shrink-0 space-y-3 pt-3 pb-4" aria-label="Динамика">
      {hasValues ? (
        <div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-start px-2 pt-1">
            <div>
              <p className="text-sm leading-5 font-semibold text-primary">Объём</p>
              <p className="-mt-1 text-[11px] leading-3 text-muted-foreground">подх. × повт.</p>
            </div>
            <p className="pt-px text-[13px] leading-5 font-normal text-foreground">
              {visibleMonthDate ? monthLabel(visibleMonthDate) : null}
            </p>
            <div className="text-right">
              <p className="text-sm leading-5 font-semibold text-[var(--doctor-exercise-pain-chart)]">
                Боль
              </p>
              <p className="-mt-1 text-[11px] leading-3 text-muted-foreground">1–10</p>
            </div>
          </div>
          <div className="flex px-1">
            <ChartSideAxis
              values={[...volumeTicks].reverse()}
              side="left"
              color="var(--doctor-exercise-chart-label)"
            />
            <div
              ref={scrollRef}
              className="doctor-weekly-chart-scroll doctor-touch-focus-surface min-w-0 flex-1 touch-pan-x overflow-x-auto overscroll-x-contain select-none"
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehaviorX: 'contain',
                touchAction: 'pan-x',
              }}
              data-base-ui-swipe-ignore
              aria-label="График динамики: прокрутите влево для более ранних дат"
            >
              <div style={{ width, minWidth: '100%' }}>
                <ComposedChart
                  key={chartRenderKey}
                  width={width}
                  height={264}
                  data={days}
                  margin={{ top: 18, right: 0, bottom: 12, left: 0 }}
                >
                  <CartesianGrid
                    vertical
                    stroke="var(--doctor-exercise-chart-guide)"
                    horizontal={false}
                  />
                  {[0, 2, 4, 6, 8, 10].map((pain) => (
                    <ReferenceLine
                      key={pain}
                      yAxisId="pain"
                      y={pain}
                      stroke="var(--doctor-exercise-chart-grid)"
                      strokeDasharray="2 3"
                    />
                  ))}
                  <XAxis
                    dataKey="chartKey"
                    axisLine={{ stroke: 'var(--doctor-exercise-chart-axis)' }}
                    tickLine={false}
                    tick={<ChartDateTick entriesByKey={entriesByKey} />}
                    height={54}
                    interval={0}
                  />
                  <YAxis
                    yAxisId="volume"
                    hide
                    domain={[0, volumeTicks[volumeTicks.length - 1] ?? 0]}
                  />
                  <YAxis yAxisId="pain" hide domain={[0, 10]} />
                  <Tooltip
                    trigger="click"
                    cursor={{ fill: 'var(--doctor-exercise-completion-bg)' }}
                    content={<ExerciseChartTooltip />}
                  />
                  <Bar
                    yAxisId="volume"
                    dataKey="volume"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={23}
                    fill="var(--doctor-exercise-difficulty-none)"
                    fillOpacity={0.8}
                    isAnimationActive={false}
                  >
                    {days.map((day) => (
                      <Cell
                        key={day.chartKey}
                        fill={difficultyColor[day.difficulty ?? 'none']}
                        fillOpacity={0.9}
                      />
                    ))}
                    <LabelList
                      dataKey="weightChangeLabel"
                      position="top"
                      fill="var(--doctor-exercise-completion-text)"
                      fontSize={10}
                    />
                  </Bar>
                  <Line
                    yAxisId="pain"
                    dataKey="painScale"
                    stroke="transparent"
                    strokeOpacity={0}
                    dot={false}
                    activeDot={false}
                    legendType="none"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="pain"
                    dataKey="painLine010"
                    stroke="var(--doctor-exercise-pain-chart)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {days.flatMap((day) =>
                    day.pain010 === null
                      ? []
                      : [
                          <ReferenceDot
                            key={day.chartKey}
                            x={day.chartKey}
                            yAxisId="pain"
                            y={day.pain010}
                            r={4}
                            fill="var(--doctor-exercise-pain-chart)"
                            stroke="#fff"
                            strokeWidth={1}
                          />,
                        ],
                  )}
                </ComposedChart>
              </div>
            </div>
            <ChartSideAxis
              values={[10, 8, 6, 4, 2, 0]}
              side="right"
              color="var(--doctor-exercise-pain-chart)"
            />
          </div>
          <div
            className={cn(doctorMetaTextClass, 'mt-2 flex items-start justify-between gap-4 px-4')}
          >
            <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1">
              {(['easy', 'medium', 'hard', 'none'] as const).map((difficulty) => (
                <span
                  key={difficulty}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span
                    className="size-3 rounded-[3px]"
                    style={{ backgroundColor: difficultyColor[difficulty] }}
                  />
                  {difficulty === 'none' ? 'Не указано' : difficultyLabel[difficulty]}
                </span>
              ))}
            </div>
            <div className="grid content-start gap-y-1">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="h-0.5 w-5 bg-[var(--doctor-exercise-pain-chart)]" />
                Боль
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="inline-flex items-center gap-0.5" aria-hidden>
                  <span className="size-1.5 rounded-full bg-[var(--doctor-exercise-completion-dot)]" />
                  <span className="size-1.5 rounded-full bg-[var(--doctor-exercise-completion-dot)]" />
                </span>
                Выполнено
              </span>
            </div>
          </div>
        </div>
      ) : (
        <p className={cn(doctorMetaTextClass, 'px-4')}>Данные выполнения пока не появились</p>
      )}
    </section>
  );
}

function ExerciseJournal({ days }: { days: JournalDay[] }) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const monthHeaders = container.querySelectorAll<HTMLElement>('[data-journal-month]');
    const latestMonth = monthHeaders.item(monthHeaders.length - 1);
    const columns = container.querySelector<HTMLElement>('[data-journal-columns]');
    if (latestMonth) {
      const monthTop =
        latestMonth.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop;
      container.scrollTop = Math.max(0, monthTop - (columns?.offsetHeight ?? 0) - 8);
    }
  }, [days.length]);

  if (days.length === 0) {
    return (
      <section className="px-4 py-4">
        <p className={doctorMetaTextClass}>История выполнения пока пуста</p>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Журнал выполнений">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          touchAction: 'pan-y',
        }}
        data-base-ui-swipe-ignore
      >
        <div>
          <div
            data-journal-columns
            className="sticky top-0 z-10 grid grid-cols-[3.5rem_minmax(0,1.35fr)_3rem_2.5rem_minmax(0,1.1fr)_1.5rem] gap-x-1 border-b border-border/70 bg-white px-2 py-2 text-[10px] text-muted-foreground"
          >
            <span>Дата</span>
            <span>Повт. × подх.</span>
            <span>Вес</span>
            <span>Боль</span>
            <span className="text-center">Сложн.</span>
            <span aria-label="Комментарии" />
          </div>
          {days.flatMap((day, dayIndex) => {
            const currentMonth = day.date.slice(0, 7);
            const previousMonth = days[dayIndex - 1]?.date.slice(0, 7) ?? null;
            const monthHeader = currentMonth === previousMonth ? null : currentMonth;
            const rows = day.completions.length > 0 ? day.completions : [null];
            const hasComments = day.comments.length > 0;
            const expanded = expandedDate === day.date;
            return [
              ...(monthHeader
                ? [
                    <div
                      key={`month-${monthHeader}`}
                      data-journal-month={monthHeader}
                      className="mx-3 mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm font-medium text-muted-foreground"
                    >
                      {monthLabel(day.date)}
                    </div>,
                  ]
                : []),
              ...rows.map((point, index) => {
                const complete = point !== null;
                const isToggleRow = hasComments && index === rows.length - 1;
                return (
                  <div
                    key={point?.completionId ?? `${day.date}-empty`}
                    className="grid min-h-12 grid-cols-[3.5rem_minmax(0,1.35fr)_3rem_2.5rem_minmax(0,1.1fr)_1.5rem] items-center gap-x-1 border-b border-border/60 px-2 py-1.5 text-sm text-foreground"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums',
                          complete
                            ? 'text-[var(--doctor-exercise-completion-text)]'
                            : 'text-[var(--doctor-exercise-date-inactive)]',
                        )}
                      >
                        {dateDayLabel(day.date)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {weekdayLabel(day.date)}
                      </span>
                    </div>
                    <span className="whitespace-nowrap">{point ? formatRepsSets(point) : '—'}</span>
                    <span className="whitespace-nowrap">
                      {point?.weightKg !== null && point?.weightKg !== undefined
                        ? formatWeight(point.weightKg)
                        : '—'}
                    </span>
                    <span>
                      {point?.pain010 !== null && point?.pain010 !== undefined ? (
                        <span
                          className={cn(
                            'inline-flex h-7 w-9 items-center justify-center rounded-lg px-1.5 font-semibold',
                            painClass(point.pain010),
                          )}
                        >
                          {point.pain010}
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span>
                      {point?.difficulty ? (
                        <span
                          className={cn(
                            'inline-flex h-7 w-full items-center justify-center rounded-[5px] px-1 text-xs font-medium whitespace-nowrap',
                            point.difficulty === 'easy' &&
                              'bg-[color:color-mix(in_srgb,var(--doctor-exercise-difficulty-easy)_45%,white)] text-[var(--doctor-exercise-completion-text)]',
                            point.difficulty === 'medium' &&
                              'bg-[color:color-mix(in_srgb,var(--doctor-exercise-difficulty-medium)_36%,white)] text-[var(--doctor-exercise-completion-text)]',
                            point.difficulty === 'hard' &&
                              'bg-[var(--doctor-exercise-difficulty-hard)] text-white',
                          )}
                        >
                          {difficultyLabel[point.difficulty]}
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                    {isToggleRow ? (
                      <button
                        type="button"
                        className="inline-flex size-6 items-center justify-center rounded-md text-[var(--doctor-exercise-completion-text)] hover:bg-[var(--doctor-exercise-comment-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Комментарии за ${day.date}`}
                        aria-expanded={expanded}
                        onClick={() => setExpandedDate(expanded ? null : day.date)}
                      >
                        {expanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              }),
              ...(expanded
                ? [
                    <div
                      key={`comments-${day.date}`}
                      className="border-b border-border/60 bg-[var(--doctor-exercise-comment-bg)] px-4 py-3"
                    >
                      <div className="space-y-2 text-sm text-foreground">
                        {day.comments.map((comment) => (
                          <p key={comment.id}>{comment.body}</p>
                        ))}
                      </div>
                    </div>,
                  ]
                : []),
            ];
          })}
        </div>
      </div>
    </section>
  );
}

export type DoctorExerciseStatisticsView = 'dynamics' | 'journal';

export function DoctorExerciseStatisticsPanel({
  active,
  patientUserId,
  instanceId,
  itemId,
  view,
}: {
  active: boolean;
  patientUserId: string;
  instanceId: string;
  itemId: string;
  view: DoctorExerciseStatisticsView;
}) {
  const requestKey = `${patientUserId}:${instanceId}:${itemId}`;
  const [history, setHistory] = useState<HistoryState>({
    key: '',
    state: 'loading',
    points: [],
    comments: [],
    iana: null,
  });

  useEffect(() => {
    if (!active) return;
    let requestActive = true;
    const params = new URLSearchParams({ instanceId, stageItemId: itemId, scope: 'all' });
    void fetch(`/api/doctor/comments/exercise-metrics?${params.toString()}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as HistoryResponse | null;
        if (!requestActive) return;
        if (response.status === 404) {
          setHistory({ key: requestKey, state: 'empty', points: [], comments: [], iana: null });
          return;
        }
        if (
          !response.ok ||
          !payload?.ok ||
          !Array.isArray(payload.points) ||
          !Array.isArray(payload.comments) ||
          !payload.iana
        ) {
          setHistory({ key: requestKey, state: 'error', points: [], comments: [], iana: null });
          return;
        }
        setHistory({
          key: requestKey,
          state: 'ready',
          points: payload.points,
          comments: payload.comments,
          iana: payload.iana,
        });
      })
      .catch(() => {
        if (requestActive)
          setHistory({ key: requestKey, state: 'error', points: [], comments: [], iana: null });
      });
    return () => {
      requestActive = false;
    };
  }, [active, instanceId, itemId, requestKey]);

  const journalDays = useMemo(
    () =>
      history.state === 'ready'
        ? journalDaysFromHistory(history.points, history.comments, history.iana)
        : [],
    [history],
  );
  const chartDays = useMemo(
    () =>
      history.state === 'ready' ? chartDaysFromJournal(calendarDaysFromJournal(journalDays)) : [],
    [history, journalDays],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {history.key !== requestKey || history.state === 'loading' ? (
        <DoctorPanelLoading className="min-h-48" />
      ) : null}
      {history.key === requestKey && history.state === 'error' ? (
        <p className="px-4 py-4 text-sm text-destructive">Не удалось загрузить статистику</p>
      ) : null}
      {history.key === requestKey && history.state === 'empty' ? (
        <p className={cn(doctorMetaTextClass, 'px-4 py-4')}>
          {view === 'dynamics'
            ? 'Данные выполнения пока не появились'
            : 'История выполнения пока пуста'}
        </p>
      ) : null}
      {history.key === requestKey && history.state === 'ready' ? (
        view === 'dynamics' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ExerciseDynamicsChart days={chartDays} />
          </div>
        ) : (
          <ExerciseJournal days={journalDays} />
        )
      ) : null}
    </div>
  );
}
