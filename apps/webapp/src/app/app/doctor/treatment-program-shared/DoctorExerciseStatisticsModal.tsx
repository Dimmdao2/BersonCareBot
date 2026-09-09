'use client';

import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
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
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  doctorMetaTextClass,
  doctorSectionTitleClass,
} from '@/shared/ui/doctor/doctorVisual';

type HistoryResponse = {
  ok?: boolean;
  iana?: string;
  points?: ExerciseMetricPoint[];
  comments?: ExerciseHistoryComment[];
};

type HistoryState =
  | { key: string; state: 'loading'; points: []; comments: []; iana: null }
  | { key: string; state: 'error'; points: []; comments: []; iana: null }
  | {
      key: string;
      state: 'ready';
      points: ExerciseMetricPoint[];
      comments: ExerciseHistoryComment[];
      iana: string;
    };

type Period = '14' | '30' | 'all';

type JournalDay = {
  date: string;
  completions: ExerciseMetricPoint[];
  comments: ExerciseHistoryComment[];
};

type ChartDay = JournalDay & {
  volume: number | null;
  pain010: number | null;
  difficulty: LfkPostSessionDifficulty | null;
  lastWeightKg: number | null;
  weightChangeLabel: string | null;
};

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: '14', label: '2 нед.' },
  { value: '30', label: 'Месяц' },
  { value: 'all', label: 'Всё' },
];

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
  return `bg-[var(--doctor-exercise-pain-${value})]`;
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
  const dates = [...new Set([...keyedPoints.map((item) => item.date), ...keyedComments.map((item) => item.date)])]
    .sort();
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

function calendarDaysFromJournal(days: JournalDay[], iana: string): JournalDay[] {
  const firstDate = days[0]?.date;
  if (!firstDate) return [];
  const byDate = new Map(days.map((day) => [day.date, day]));
  const today = localDateKey(new Date().toISOString(), iana) ?? firstDate;
  const calendarDays: JournalDay[] = [];
  for (let date = firstDate; date <= today; date = addDays(date, 1)) {
    calendarDays.push(byDate.get(date) ?? { date, completions: [], comments: [] });
  }
  return calendarDays;
}

function chartDaysFromJournal(days: JournalDay[]): ChartDay[] {
  let previousWeight: number | null = null;
  return days.map((day) => {
    const lastCompletion = day.completions[day.completions.length - 1] ?? null;
    const volumeValues = day.completions.flatMap((point) =>
      point.reps !== null && point.sets !== null ? [point.reps * point.sets] : [],
    );
    const lastWeightKg = lastCompletion?.weightKg ?? null;
    const delta =
      lastWeightKg !== null && previousWeight !== null ? lastWeightKg - previousWeight : null;
    if (lastWeightKg !== null) previousWeight = lastWeightKg;
    return {
      ...day,
      volume: volumeValues.length > 0 ? volumeValues.reduce((sum, value) => sum + value, 0) : null,
      pain010: lastCompletion?.pain010 ?? null,
      difficulty: lastCompletion?.difficulty ?? null,
      lastWeightKg,
      weightChangeLabel: delta && delta !== 0 ? `${delta > 0 ? '+' : ''}${delta} кг` : null,
    };
  });
}

function chartPeriod(days: ChartDay[], period: Period): ChartDay[] {
  if (period === 'all') return days;
  return days.slice(period === '14' ? -14 : -30);
}

function painSegments(days: ChartDay[]): ChartDay[][] {
  const segments: ChartDay[][] = [];
  let active: ChartDay[] = [];
  let previousPainDate: string | null = null;
  for (const day of days) {
    if (day.pain010 === null) continue;
    if (previousPainDate && DateTime.fromISO(day.date).diff(DateTime.fromISO(previousPainDate), 'days').days > 4) {
      if (active.length > 0) segments.push(active);
      active = [];
    }
    active.push(day);
    previousPainDate = day.date;
  }
  if (active.length > 0) segments.push(active);
  return segments;
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

function ExerciseDynamicsChart({ days, period, onPeriodChange }: {
  days: ChartDay[];
  period: Period;
  onPeriodChange: (period: Period) => void;
}) {
  const visibleDays = chartPeriod(days, period);
  const width = Math.max(640, visibleDays.length * 52);
  const segments = painSegments(visibleDays);
  const hasValues = visibleDays.some((day) => day.volume !== null || day.pain010 !== null);

  return (
    <section className="space-y-3" aria-label="Динамика">
      <div className="flex items-center justify-between gap-3">
        <h2 className={doctorSectionTitleClass}>Динамика</h2>
        <div className="flex shrink-0 gap-1" aria-label="Период динамики">
          {periodOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={period === option.value ? 'default' : 'secondary'}
              className="h-8 px-2.5 text-xs"
              onClick={() => onPeriodChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {hasValues ? (
        <div className="rounded-lg border border-border/60 bg-white p-2.5">
          <div className="flex items-start justify-between px-1">
            <div>
              <p className="text-sm font-semibold text-primary">Объём</p>
              <p className={doctorMetaTextClass}>подходы × повторы</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[var(--doctor-exercise-pain-chart)]">Боль</p>
              <p className={doctorMetaTextClass}>(0–10)</p>
            </div>
          </div>
          <div className="doctor-weekly-chart-scroll mt-1 overflow-x-auto overscroll-x-contain pb-1">
            <div style={{ width }}>
              <ComposedChart width={width} height={230} data={visibleDays} margin={{ top: 26, right: 28, bottom: 8, left: 4 }}>
                <CartesianGrid vertical stroke="var(--doctor-exercise-chart-guide)" horizontal={false} />
                {[0, 2, 4, 6, 8, 10].map((pain) => (
                  <ReferenceLine
                    key={pain}
                    yAxisId="pain"
                    y={pain}
                    stroke="var(--doctor-exercise-chart-grid)"
                    strokeDasharray="3 3"
                  />
                ))}
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={false} height={10} />
                <YAxis
                  yAxisId="volume"
                  axisLine={{ stroke: 'var(--doctor-exercise-chart-axis)' }}
                  tickLine={false}
                  tick={{ fill: 'var(--doctor-exercise-chart-label)', fontSize: 11 }}
                  width={34}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="pain"
                  orientation="right"
                  domain={[0, 10]}
                  ticks={[0, 2, 4, 6, 8, 10]}
                  axisLine={{ stroke: 'var(--doctor-exercise-pain-chart)' }}
                  tickLine={false}
                  tick={{ fill: 'var(--doctor-exercise-pain-chart)', fontSize: 11 }}
                  width={26}
                />
                <Tooltip trigger="click" cursor={{ fill: 'var(--doctor-exercise-completion-bg)' }} content={<ExerciseChartTooltip />} />
                <Bar yAxisId="volume" dataKey="volume" radius={[4, 4, 0, 0]} maxBarSize={24} fill="var(--doctor-exercise-difficulty-none)" fillOpacity={0.8}>
                  {visibleDays.map((day) => (
                    <Cell key={day.date} fill={difficultyColor[day.difficulty ?? 'none']} fillOpacity={0.8} />
                  ))}
                  <LabelList dataKey="weightChangeLabel" position="top" fill="var(--doctor-exercise-completion-text)" fontSize={10} />
                </Bar>
                {segments.map((segment, index) => (
                  <Line
                    key={segment[0]?.date ?? index}
                    data={segment}
                    yAxisId="pain"
                    dataKey="pain010"
                    stroke="var(--doctor-exercise-pain-chart)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--doctor-exercise-pain-chart)', stroke: '#fff', strokeWidth: 1 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
              <div
                className="grid pt-1"
                style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))` }}
              >
                {visibleDays.map((day) => {
                  const complete = day.completions.length > 0;
                  return (
                    <div key={day.date} className="flex min-w-0 flex-col items-center gap-0.5 text-center">
                      <span
                        className={cn(
                          'inline-flex min-w-7 justify-center rounded-md px-1 py-0.5 text-xs font-semibold tabular-nums',
                          complete
                            ? 'bg-[var(--doctor-exercise-completion-bg)] text-[var(--doctor-exercise-completion-text)]'
                            : 'text-[var(--doctor-exercise-date-inactive)]',
                        )}
                      >
                        {dateDayLabel(day.date)}
                      </span>
                      <span className="text-[10px] text-[var(--doctor-exercise-date-inactive)]">
                        {weekdayLabel(day.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className={cn(doctorMetaTextClass, 'mt-3 flex flex-wrap gap-x-3 gap-y-1')}>
            {(['none', 'easy', 'medium', 'hard'] as const).map((difficulty) => (
              <span key={difficulty} className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ backgroundColor: difficultyColor[difficulty] }} />
                {difficulty === 'none' ? 'Сложность не указана' : difficultyLabel[difficulty]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-[var(--doctor-exercise-pain-chart)]" />
              Боль (0–10)
            </span>
          </div>
        </div>
      ) : (
        <p className={doctorMetaTextClass}>Данные выполнения пока не появились</p>
      )}
    </section>
  );
}

function ExerciseJournal({ days }: { days: JournalDay[] }) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  if (days.length === 0) {
    return (
      <section className="border-t border-border/60 pt-4">
        <h2 className={doctorSectionTitleClass}>Журнал выполнений</h2>
        <p className={cn(doctorMetaTextClass, 'mt-2')}>История выполнения пока пуста</p>
      </section>
    );
  }

  let previousMonth: string | null = null;
  return (
    <section className="border-t border-border/60 pt-4" aria-label="Журнал выполнений">
      <h2 className={doctorSectionTitleClass}>Журнал выполнений</h2>
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[7.25rem_minmax(7.5rem,1fr)_5rem_4.75rem_6.5rem_1.5rem] border-b border-border/70 px-2 py-2 text-xs text-muted-foreground">
            <span>Дата</span>
            <span>Повторы × подходы</span>
            <span>Вес</span>
            <span>Боль</span>
            <span>Сложность</span>
            <span aria-label="Комментарии" />
          </div>
          {days.flatMap((day) => {
            const currentMonth = day.date.slice(0, 7);
            const monthHeader = currentMonth === previousMonth ? null : currentMonth;
            previousMonth = currentMonth;
            const rows = day.completions.length > 0 ? day.completions : [null];
            const hasComments = day.comments.length > 0;
            const expanded = expandedDate === day.date;
            return [
              ...(monthHeader
                ? [
                    <div key={`month-${monthHeader}`} className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm font-medium text-muted-foreground">
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
                    className="grid grid-cols-[7.25rem_minmax(7.5rem,1fr)_5rem_4.75rem_6.5rem_1.5rem] items-center border-b border-border/60 px-2 py-2 text-sm text-foreground"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex min-w-8 justify-center rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums',
                          complete
                            ? 'bg-[var(--doctor-exercise-completion-bg)] text-[var(--doctor-exercise-completion-text)]'
                            : 'text-[var(--doctor-exercise-date-inactive)]',
                        )}
                      >
                        {dateDayLabel(day.date)}
                      </span>
                      <span className="text-xs text-muted-foreground">{weekdayLabel(day.date)}</span>
                    </div>
                    <span>{point ? formatRepsSets(point) : '—'}</span>
                    <span>{point?.weightKg !== null && point?.weightKg !== undefined ? formatWeight(point.weightKg) : '—'}</span>
                    <span>
                      {point?.pain010 !== null && point?.pain010 !== undefined ? (
                        <span className={cn('inline-flex min-w-9 justify-center rounded-md px-2 py-1 font-semibold', painClass(point.pain010))}>
                          {point.pain010}
                        </span>
                      ) : '—'}
                    </span>
                    <span>
                      {point?.difficulty ? (
                        <span
                          className={cn(
                            'inline-flex min-w-20 justify-center rounded-md px-2 py-1 font-medium',
                            point.difficulty === 'easy' && 'bg-[color:color-mix(in_srgb,var(--doctor-exercise-difficulty-easy)_35%,white)] text-primary',
                            point.difficulty === 'medium' && 'bg-[color:color-mix(in_srgb,var(--doctor-exercise-difficulty-medium)_24%,white)] text-primary',
                            point.difficulty === 'hard' && 'bg-[var(--doctor-exercise-difficulty-hard)] text-white',
                          )}
                        >
                          {difficultyLabel[point.difficulty]}
                        </span>
                      ) : '—'}
                    </span>
                    {isToggleRow ? (
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-[var(--doctor-exercise-completion-text)] hover:bg-[var(--doctor-exercise-comment-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Комментарии за ${day.date}`}
                        aria-expanded={expanded}
                        onClick={() => setExpandedDate(expanded ? null : day.date)}
                      >
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    ) : <span />}
                  </div>
                );
              }),
              ...(expanded
                ? [
                    <div key={`comments-${day.date}`} className="border-b border-border/60 bg-[var(--doctor-exercise-comment-bg)] px-4 py-3">
                      <div className="space-y-2 text-sm text-foreground">
                        {day.comments.map((comment) => <p key={comment.id}>{comment.body}</p>)}
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

export function DoctorExerciseStatisticsModal({
  open,
  onClose,
  patientUserId,
  patientName,
  patientOnSupport = false,
  patientVariant = 'link',
  exerciseTitle,
  instanceId,
  itemId,
}: {
  open: boolean;
  onClose: () => void;
  patientUserId: string;
  patientName?: string | null;
  patientOnSupport?: boolean;
  patientVariant?: 'link' | 'context';
  exerciseTitle: string;
  instanceId: string;
  itemId: string;
}) {
  const requestKey = `${patientUserId}:${instanceId}:${itemId}`;
  const [history, setHistory] = useState<HistoryState>({
    key: '',
    state: 'loading',
    points: [],
    comments: [],
    iana: null,
  });
  const [period, setPeriod] = useState<Period>('14');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setHistory({ key: requestKey, state: 'loading', points: [], comments: [], iana: null });
    const params = new URLSearchParams({ instanceId, stageItemId: itemId, scope: 'all' });
    void fetch(`/api/doctor/comments/exercise-metrics?${params.toString()}`, {
      credentials: 'include',
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as HistoryResponse | null;
        if (!active) return;
        if (!response.ok || !payload?.ok || !Array.isArray(payload.points) || !Array.isArray(payload.comments) || !payload.iana) {
          setHistory({ key: requestKey, state: 'error', points: [], comments: [], iana: null });
          return;
        }
        setHistory({ key: requestKey, state: 'ready', points: payload.points, comments: payload.comments, iana: payload.iana });
      })
      .catch(() => {
        if (active) setHistory({ key: requestKey, state: 'error', points: [], comments: [], iana: null });
      });
    return () => {
      active = false;
    };
  }, [instanceId, itemId, open, requestKey]);

  const journalDays = useMemo(
    () => history.state === 'ready' ? journalDaysFromHistory(history.points, history.comments, history.iana) : [],
    [history],
  );
  const chartDays = useMemo(
    () => history.state === 'ready' ? chartDaysFromJournal(calendarDaysFromJournal(journalDays, history.iana)) : [],
    [history, journalDays],
  );

  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={
        <DoctorModalStackedTitle
          label="Статистика"
          entity={exerciseTitle}
          patientName={patientName}
          patientHref={patientCardHref(patientUserId)}
          patientOnSupport={patientOnSupport}
          patientVariant={patientVariant}
          entityClassName={patientVariant === 'context' ? 'text-primary' : undefined}
        />
      }
      size="content"
      bodyClassName="space-y-5"
    >
      {history.key !== requestKey || history.state === 'loading' ? <DoctorPanelLoading className="min-h-48" /> : null}
      {history.key === requestKey && history.state === 'error' ? <p className="text-sm text-destructive">Не удалось загрузить статистику</p> : null}
      {history.key === requestKey && history.state === 'ready' ? <>
        <ExerciseDynamicsChart days={chartDays} period={period} onPeriodChange={setPeriod} />
        <ExerciseJournal days={journalDays} />
      </> : null}
    </DoctorModal>
  );
}
