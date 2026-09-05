'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { DateTime } from 'luxon';
import { Check, Layers, MapPin } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/doctor/primitives/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import {
  apiJson,
  minuteToTimeLabel,
  timeLabelToMinute,
} from '@/app/app/settings/bookingSoloAdminApi';
import { fetchDoctorScheduleBootstrap } from '../doctorScheduleApi';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { DoctorSection } from '@/shared/ui/doctor/DoctorSection';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorCatalogStickyToolbar } from '@/shared/ui/doctor/DoctorCatalogStickyToolbar';
import {
  DOCTOR_ACTIVE_FILTER_BUTTON_CLASS,
  DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
  DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS,
  DoctorSchedulePeriodNav,
} from '@/shared/ui/doctor/calendar/DoctorSchedulePeriodNav';
import { DoctorDateTimePicker } from '@/shared/ui/doctor/DoctorDateTimePicker';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { emitDoctorScheduleCalendarRefresh } from '../scheduleCalendarEvents';
import { cn } from '@/lib/utils';
import type { ScheduleTabProps } from '../scheduleTabRegistry';

// ---------------------------------------------------------------------------
// API base paths
// ---------------------------------------------------------------------------

// Doctor-self-scoped routes: the server resolves the doctor's own specialist and forces
// it on every read/write, so the editor works for the `doctor` role (solo owner) and
// reads/writes the SAME specialist-scoped rows the calendar paints.
const WD_BASE = '/api/doctor/booking-engine/working-days';
const TPL_BASE = '/api/doctor/booking-engine/working-schedule-templates';
const WH_BASE = '/api/doctor/booking-engine/working-hours';
const DEFAULT_PANEL_START = '09:00';
const DEFAULT_PANEL_END = '18:00';

// #829: base-ui's `Select` (used by the "Локация"/city control) renders its dropdown
// content in a `document.body` portal — it's a React-tree descendant of the panel here
// but NOT a DOM descendant, so `Element.closest()` can't find `hours-panel`/interactive
// ancestors through it. Recognize any select part (`select-content`, `select-item`, …,
// all tagged `data-slot="select-*"` by the primitive) so opening/using that dropdown is
// never mistaken for a "click outside" that should clear the in-progress selection. The doctor
// modal layers (dialog/drawer/sheet) portal the same way, so editing inside the weekday-template
// modal must not read as an outside click that drops the very selection being edited.
const INTERACTIVE_PORTAL_SELECTOR =
  "[data-slot^='select'],[data-slot^='popover'],[data-slot^='dialog'],[data-slot^='drawer'],[data-slot^='sheet'],[role='dialog']";

/**
 * WORK-01: one grid for «Начало», «Конец» and the break rows — two equal time columns plus a
 * trailing column for the remove action, so every label sits above its own field.
 */
const SCHEDULE_FIELD_GRID_CLASS =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-end gap-x-2 gap-y-2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Branch = {
  id: string;
  title: string;
  /** Short display name (e.g. «СПб», «Мск»). Migration 0117. */
  shortTitle: string | null;
  color: string | null;
  isActive: boolean;
};

type BreakInterval = { startMinute: number; endMinute: number };

type WorkingDayRecord = {
  id: string;
  workDate: string; // YYYY-MM-DD
  startMinute: number | null;
  endMinute: number | null;
  breaks: BreakInterval[];
  isClosed: boolean;
  branchId: string | null;
};

type ScheduleTemplateRecord = {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  breaks: BreakInterval[];
  branchId: string | null;
  sortOrder: number;
  isActive: boolean;
};

type WorkingHoursRow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  isActive: boolean;
  branchId: string | null;
};

type EffectiveHours =
  | { source: 'template'; startMinute: number; endMinute: number; branchId: string | null }
  | { source: 'override'; startMinute: number; endMinute: number; branchId: string | null }
  | { source: 'closed' }
  | null;

/**
 * One rendered schedule row of a calendar day. A day can carry several rows when the
 * weekday template assigns more than one location to it, so each row keeps its own hours
 * and its own location colour instead of collapsing to a single line.
 */
type DayScheduleLine = {
  source: 'template' | 'override';
  startMinute: number;
  endMinute: number;
  branchId: string | null;
};

/** A single break row state in the hours panel or template form. */
type BreakRow = { from: string; to: string };

type PanelScheduleDefaults = {
  startMinute: number;
  endMinute: number;
  breaks: BreakInterval[];
  branchId: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a YYYY-MM-DD string for the 1st day of the given year-month. */
function monthStart(year: number, month: number): string {
  return DateTime.fromObject({ year, month, day: 1 }).toISODate() ?? '';
}

/** Build a YYYY-MM-DD string for the last day of the given year-month. */
function monthEnd(year: number, month: number): string {
  return DateTime.fromObject({ year, month, day: 1 }).endOf('month').toISODate() ?? '';
}

/** Parse "YYYY-MM" from deepLink or produce current month. */
function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (y && m && m >= 1 && m <= 12) return { year: y, month: m };
  }
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (y && m && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = DateTime.now();
  return { year: now.year, month: now.month };
}

/** Format year-month as "YYYY-MM". */
function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * WORK-06: a weekday selection saves a permanent weekday schedule, so its heading names the
 * weekday itself instead of counting how many of its dates the open month happens to contain.
 */
const WD_EVERY_LABEL: Record<number, string> = {
  0: 'воскресеньям',
  1: 'понедельникам',
  2: 'вторникам',
  3: 'средам',
  4: 'четвергам',
  5: 'пятницам',
  6: 'субботам',
};

/** Russian month names (1-indexed). */
const RU_MONTHS = [
  '',
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

/** Build the array of calendar cell dates for a full month grid (Mon-first, padded to complete weeks). */
function buildMonthGrid(year: number, month: number): Array<string | null> {
  const first = DateTime.fromObject({ year, month, day: 1 });
  const daysInMonth = first.daysInMonth ?? 30;
  const startPad = (first.weekday - 1 + 7) % 7;
  const cells: Array<string | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(DateTime.fromObject({ year, month, day: d }).toISODate() ?? null);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function resolveEffectiveHours(
  dateKey: string,
  dayMap: Map<string, WorkingDayRecord>,
  workingHours: WorkingHoursRow[],
): EffectiveHours {
  const record = dayMap.get(dateKey);
  if (record) {
    if (record.isClosed) return { source: 'closed' };
    if (record.startMinute != null && record.endMinute != null) {
      return {
        source: 'override',
        startMinute: record.startMinute,
        endMinute: record.endMinute,
        branchId: record.branchId,
      };
    }
  }
  // Luxon weekday: 1=Mon..7=Sun. be_working_hours: 0=Sun, 1=Mon..6=Sat → (luxon % 7)
  const luxonWd = DateTime.fromISO(dateKey).weekday;
  const wd = luxonWd % 7;
  const match = workingHours.find((wh) => wh.weekday === wd && wh.isActive);
  if (match) {
    return {
      source: 'template',
      startMinute: match.startMinute,
      endMinute: match.endMinute,
      branchId: match.branchId,
    };
  }
  return null;
}

/**
 * Effective schedule rows of a date: the per-date override when present, otherwise every
 * active weekday-template row of that weekday (WORK-03/04/05). Concrete dates that only
 * inherit the weekly template therefore render exactly like the template that produced them.
 */
function resolveDayScheduleLines(
  dateKey: string,
  dayMap: Map<string, WorkingDayRecord>,
  workingHours: WorkingHoursRow[],
): DayScheduleLine[] {
  const record = dayMap.get(dateKey);
  if (record) {
    if (record.isClosed) return [];
    if (record.startMinute != null && record.endMinute != null) {
      return [
        {
          source: 'override',
          startMinute: record.startMinute,
          endMinute: record.endMinute,
          branchId: record.branchId,
        },
      ];
    }
  }
  const wd = DateTime.fromISO(dateKey).weekday % 7;
  return workingHours
    .filter((row) => row.weekday === wd && row.isActive)
    .map((row) => ({
      source: 'template' as const,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      branchId: row.branchId,
    }))
    .sort((a, b) => a.startMinute - b.startMinute);
}

function resolvePanelDefaultsForDate(
  dateKey: string,
  dayMap: Map<string, WorkingDayRecord>,
  workingHours: WorkingHoursRow[],
): PanelScheduleDefaults | null {
  const record = dayMap.get(dateKey);
  if (record) {
    if (record.isClosed) return null;
    if (record.startMinute != null && record.endMinute != null) {
      return {
        startMinute: record.startMinute,
        endMinute: record.endMinute,
        breaks: resolveBreaks(record),
        branchId: record.branchId,
      };
    }
  }

  const wd = DateTime.fromISO(dateKey).weekday % 7;
  const match = workingHours.find((wh) => wh.weekday === wd && wh.isActive);
  if (!match) return null;
  return {
    startMinute: match.startMinute,
    endMinute: match.endMinute,
    breaks: [],
    branchId: match.branchId,
  };
}

function resolvePanelDefaultsForWeekday(
  weekday: number,
  workingHours: WorkingHoursRow[],
): PanelScheduleDefaults | null {
  const match = workingHours.find((wh) => wh.weekday === weekday && wh.isActive);
  if (!match) return null;
  return {
    startMinute: match.startMinute,
    endMinute: match.endMinute,
    breaks: [],
    branchId: match.branchId,
  };
}

function formatHourRange(start: number | null, end: number | null): string {
  if (start == null || end == null) return '';
  const sh = Math.floor(start / 60);
  const eh = Math.floor(end / 60);
  return `${sh}–${eh}`;
}

/** Resolve effective breaks from a record (N-break model; legacy scalars dropped in migration 0118). */
function resolveBreaks(record: WorkingDayRecord): BreakInterval[] {
  return record.breaks ?? [];
}

/** Format break summary for a day card: "обед HH–HH" (1 break) or "N перерывов" (multiple). */
function formatBreakSummary(breaks: BreakInterval[]): string {
  if (breaks.length === 0) return '';
  if (breaks.length === 1) {
    const b = breaks[0];
    if (!b) return '';
    return `обед ${Math.floor(b.startMinute / 60)}–${Math.floor(b.endMinute / 60)}`;
  }
  return `${breaks.length} перерыва`;
}

function updateBreakRow(
  rows: BreakRow[],
  idx: number,
  field: 'from' | 'to',
  value: string,
): BreakRow[] {
  return rows.map((row, i) => (i === idx ? { ...row, [field]: value } : row));
}

function removeBreakRow(rows: BreakRow[], idx: number): BreakRow[] {
  return rows.filter((_, i) => i !== idx);
}

function addBreakRow(rows: BreakRow[]): BreakRow[] {
  return [...rows, { from: '13:00', to: '14:00' }];
}

/** Convert BreakInterval[] to BreakRow[] for panel state. */
function breaksToRows(breaks: BreakInterval[]): BreakRow[] {
  return breaks.map((b) => ({
    from: minuteToTimeLabel(b.startMinute),
    to: minuteToTimeLabel(b.endMinute),
  }));
}

/** Validate break rows against day start/end. Returns error string or null. */
function validateBreakRows(
  rows: BreakRow[],
  dayStartMin: number,
  dayEndMin: number,
): string | null {
  const parsed: BreakInterval[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    let bStart: number;
    let bEnd: number;
    try {
      bStart = timeLabelToMinute(row.from);
      bEnd = timeLabelToMinute(row.to);
    } catch {
      return `Неверный формат перерыва ${i + 1}`;
    }
    if (bStart >= bEnd) return `Перерыв ${i + 1}: начало должно быть раньше конца`;
    if (bStart < dayStartMin) return `Перерыв ${i + 1} начинается раньше начала рабочего дня`;
    if (bEnd > dayEndMin) return `Перерыв ${i + 1} заканчивается после конца рабочего дня`;
    // Check overlap with previous
    for (const prev of parsed) {
      if (bStart < prev.endMinute && bEnd > prev.startMinute) {
        return `Перерывы ${i} и ${i + 1} пересекаются`;
      }
    }
    parsed.push({ startMinute: bStart, endMinute: bEnd });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Branch color palette
// ---------------------------------------------------------------------------

const BRANCH_COLORS = ['blue', 'green', 'violet', 'orange'] as const;
type BranchColor = (typeof BRANCH_COLORS)[number];
const FALLBACK_BRANCH_HEX: Record<BranchColor, string> = {
  blue: '#2563eb',
  green: '#16a34a',
  violet: '#7c3aed',
  orange: '#ea580c',
};

function getBranchColor(branches: Branch[], branchId: string): BranchColor {
  const idx = branches.findIndex((b) => b.id === branchId);
  return BRANCH_COLORS[(idx >= 0 ? idx : 0) % BRANCH_COLORS.length] ?? 'blue';
}

function resolveBranchHex(branches: Branch[], branchId: string): string {
  const branch = branches.find((b) => b.id === branchId);
  return branch?.color ?? FALLBACK_BRANCH_HEX[getBranchColor(branches, branchId)];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : FALLBACK_BRANCH_HEX.blue;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * WORK-03/05: заливка принадлежит ПРЯМОМУ источнику расписания — плашке дня недели с сохранённым
 * недельным шаблоном и конкретной дате, настроенной вручную. Дата, только унаследовавшая недельный
 * шаблон, получает ту же палитру филиала, но без заливки: прозрачный фон и более плотная обводка.
 */
function branchCellStyle(hex: string, filled: boolean): CSSProperties {
  return {
    '--branch-bg': filled ? rgba(hex, 0.16) : 'transparent',
    '--branch-hover': rgba(hex, filled ? 0.22 : 0.08),
    '--branch-border': rgba(hex, filled ? 0.36 : 0.55),
    '--branch-fg': hex,
  } as CSSProperties;
}

function branchDisplayLabel(branch: Branch): string {
  return branch.shortTitle ?? branch.title;
}

/** One rendered line of a weekday plate: its hours plus the location that owns them. */
type WeekdayTemplateSummary = { label: string; branchId: string | null };

/**
 * WORK-03: the weekday plate shows the template hours and keeps the location only as colour —
 * repeating its name here duplicates the signal already carried by the coloured day cells below.
 * Several rows survive as several lines so a multi-location weekday keeps every location.
 */
function weekdayTemplateSummaries(
  weekday: number,
  workingHours: WorkingHoursRow[],
): WeekdayTemplateSummary[] {
  const seen = new Set<string>();
  const summaries: WeekdayTemplateSummary[] = [];
  for (const row of workingHours
    .filter((item) => item.weekday === weekday && item.isActive)
    .sort((a, b) => a.startMinute - b.startMinute)) {
    const label = formatHourRange(row.startMinute, row.endMinute);
    const key = `${label}:${row.branchId ?? 'none'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    summaries.push({ label, branchId: row.branchId });
  }
  return summaries;
}

// ---------------------------------------------------------------------------
// Month grid cell (E2 — narrower, bigger time, shortTitle)
// ---------------------------------------------------------------------------

type DayCellProps = {
  cellIndex?: number;
  dateKey: string | null;
  today: string;
  branches: Branch[];
  isSelected: boolean;
  onToggle: (date: string, shift: boolean, meta: boolean) => void;
  effectiveHours?: EffectiveHours;
  scheduleLines?: DayScheduleLine[];
};

function DayCell({
  cellIndex,
  dateKey,
  today,
  branches,
  isSelected,
  onToggle,
  effectiveHours,
  scheduleLines,
}: DayCellProps) {
  if (!dateKey) {
    return (
      <div
        className="min-h-[52px] rounded-md border border-dashed border-transparent bg-transparent transition-colors hover:border-border/70 hover:bg-muted/20"
        data-testid={cellIndex != null ? `day-cell-empty-${cellIndex}` : undefined}
      />
    );
  }

  const isToday = dateKey === today;
  // §3.15: «выходной»/isClosed removed — a day either has a schedule or falls
  // back to weekday hours (no explicit closed state surfaced in the grid).
  const lines = scheduleLines ?? [];
  const hasSchedule = lines.length > 0;
  // WORK-03/05: a date that only inherits the weekday template is rendered as an outline in the
  // location colour; a direct per-date setting keeps the filled surface.
  const isInheritedFromWeeklyTemplate =
    hasSchedule && lines.every((line) => line.source === 'template');
  // The surface keeps the location signal of the first row; every further row keeps its
  // own colour on its own line (WORK-04).
  const primaryBranchId = lines.find((line) => line.branchId)?.branchId ?? null;
  const branchHex = primaryBranchId ? resolveBranchHex(branches, primaryBranchId) : undefined;

  let cellClass =
    'rounded-md border p-1 min-h-[52px] cursor-pointer select-none transition-colors ';

  if (isToday) {
    // Today is a temporal marker, not a location state. It fully replaces the branch
    // surface so arbitrary branch colours cannot compete with the shared doctor marker.
    cellClass +=
      'border-doctor-calendar-today bg-doctor-calendar-today/90 text-white hover:bg-doctor-calendar-today/80 ';
  } else if (branchHex) {
    // Location colour remains the surface signal of every scheduled day; only its weight differs
    // by source. Today replaces the location border with the shared doctor-calendar marker.
    cellClass += isInheritedFromWeeklyTemplate
      ? 'bg-transparent border-[color:var(--branch-border)] hover:bg-[color:var(--branch-hover)] '
      : 'bg-[color:var(--branch-bg)] border-[color:var(--branch-border)] hover:bg-[color:var(--branch-hover)] ';
    if (isSelected) cellClass += 'ring-1 ring-primary/60 ';
  } else if (isSelected) {
    cellClass += 'bg-primary/15 border-primary/40 ring-1 ring-primary/40 ';
  } else if (hasSchedule) {
    // SCH-R-06: scheduled day without a location = light blue tint; the same source rule applies.
    cellClass += isInheritedFromWeeklyTemplate
      ? 'bg-transparent border-primary/40 hover:bg-primary/10 '
      : 'bg-primary/10 border-primary/20 hover:bg-primary/15 ';
  } else if (effectiveHours?.source === 'closed') {
    // SCH-R-06: closed/выходной = light red tint
    cellClass += 'bg-destructive/5 border-destructive/15 hover:bg-destructive/10 ';
  } else {
    cellClass += 'bg-card border-border/60 hover:bg-muted/30 ';
  }

  const day = DateTime.fromISO(dateKey).day;

  function branchShortLabel(branchId: string | null): string | null {
    if (!branchId) return null;
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) return null;
    return branch.shortTitle ?? branch.title.split(' ')[0] ?? branch.title;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cellClass}
      aria-pressed={isSelected}
      aria-label={`${dateKey}${
        hasSchedule
          ? ` ${lines.map((line) => formatHourRange(line.startMinute, line.endMinute)).join(', ')}`
          : ''
      }`}
      style={branchHex && !isToday ? branchCellStyle(branchHex, !isInheritedFromWeeklyTemplate) : undefined}
      onClick={(e) => onToggle(dateKey, e.shiftKey, e.metaKey || e.ctrlKey)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onToggle(dateKey, e.shiftKey, e.metaKey || e.ctrlKey);
        }
      }}
      data-testid={`day-cell-${dateKey}`}
    >
      <div
        className={cn(
          'text-[11px] font-normal leading-none text-foreground',
          isToday
            ? 'font-semibold text-white'
            : isSelected
              ? 'text-primary'
              : null,
        )}
      >
        {isSelected ? `${day} ●` : day}
      </div>
      {/* WORK-02/03/04/05: number, hours and the short location per schedule row — no break text. */}
      {lines.map((line, index) => {
        const lineHex = line.branchId ? resolveBranchHex(branches, line.branchId) : null;
        const shortLabel = branchShortLabel(line.branchId);
        return (
          <div
            key={`${line.source}:${line.startMinute}:${line.endMinute}:${line.branchId ?? 'none'}:${index}`}
            className="mt-0.5 min-w-0 leading-none"
            data-testid={`day-cell-line-${dateKey}-${index}`}
          >
            {/* WORK-05: часы — ровно одна строка без переноса, сокращение филиала — своя строка. */}
            <div
              className={cn(
                'truncate text-[11px] font-semibold whitespace-nowrap',
                isToday ? 'text-white' : !lineHex && 'text-primary',
              )}
              style={lineHex && !isToday ? { color: lineHex } : undefined}
            >
              {formatHourRange(line.startMinute, line.endMinute)}
            </div>
            {shortLabel ? (
              <div
                className={cn(
                  'mt-0.5 truncate text-[10px] leading-none',
                  isToday ? 'text-white/85' : 'text-muted-foreground',
                )}
              >
                {shortLabel}
              </div>
            ) : null}
          </div>
        );
      })}
      {!hasSchedule && effectiveHours?.source === 'closed' && (
        <div className="mt-0.5 text-[10px] leading-none text-destructive/70">выходной</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BreakRowField — single break row in hours panel or template form
// ---------------------------------------------------------------------------

type BreakRowFieldProps = {
  index: number;
  row: BreakRow;
  /** Scopes the row test ids to the hosting form. */
  idPrefix: string;
  onChange: (idx: number, field: 'from' | 'to', value: string) => void;
  onRemove: (idx: number) => void;
};

/**
 * WORK-01: schedule fields share one grid — «Начало», «Конец» and every «Перерыв» keep their
 * label above the time field and their columns aligned. Rendered as bare grid cells so the
 * hours panel and the template dialog can host the rows in the same
 * {@link SCHEDULE_FIELD_GRID_CLASS} container.
 */
function BreakRowField({ index, row, idPrefix, onChange, onRemove }: BreakRowFieldProps) {
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1" data-testid={`${idPrefix}-break-row-${index}`}>
        <Label className="text-xs">Перерыв {index + 1}</Label>
        <DoctorDateTimePicker
          mode="time"
          className="w-full"
          value={row.from}
          onChange={(value) => onChange(index, 'from', value)}
          ariaLabel={`Начало перерыва ${index + 1}`}
          testId={`${idPrefix}-break-from-${index}`}
        />
      </div>
      <div className="flex min-w-0 flex-col justify-end gap-1">
        <DoctorDateTimePicker
          mode="time"
          className="w-full"
          value={row.to}
          onChange={(value) => onChange(index, 'to', value)}
          ariaLabel={`Конец перерыва ${index + 1}`}
          testId={`${idPrefix}-break-to-${index}`}
        />
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 self-end p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(index)}
        aria-label={`Удалить перерыв ${index + 1}`}
        data-testid={`${idPrefix}-break-remove-${index}`}
      >
        ×
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// ScheduleFieldsForm — hours, breaks and location of one schedule
// ---------------------------------------------------------------------------

type ScheduleFieldsFormProps = {
  /** Scopes field ids and test ids to the hosting form. */
  idPrefix: string;
  branches: Branch[];
  start: string;
  end: string;
  breaks: BreakRow[];
  branchId: string;
  startAriaLabel: string;
  endAriaLabel: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onBreaksChange: (rows: BreakRow[]) => void;
  onBranchChange: (value: string) => void;
};

/**
 * WORK-01: «Начало», «Конец», перерывы и «Локация» одного расписания на общей сетке.
 * Одна точка для всех трёх мест, где редактируется расписание — панель выбранных дат,
 * модалка недельного шаблона (WORK-08) и диалог шаблона расписания.
 */
function ScheduleFieldsForm({
  idPrefix,
  branches,
  start,
  end,
  breaks,
  branchId,
  startAriaLabel,
  endAriaLabel,
  onStartChange,
  onEndChange,
  onBreaksChange,
  onBranchChange,
}: ScheduleFieldsFormProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className={SCHEDULE_FIELD_GRID_CLASS} data-testid={`${idPrefix}-breaks`}>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${idPrefix}-start`} className="text-xs">
            Начало
          </Label>
          <DoctorDateTimePicker
            mode="time"
            id={`${idPrefix}-start`}
            className="w-full"
            value={start}
            onChange={onStartChange}
            ariaLabel={startAriaLabel}
            testId={`${idPrefix}-start`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${idPrefix}-end`} className="text-xs">
            Конец
          </Label>
          <DoctorDateTimePicker
            mode="time"
            id={`${idPrefix}-end`}
            className="w-full"
            value={end}
            onChange={onEndChange}
            ariaLabel={endAriaLabel}
            testId={`${idPrefix}-end`}
          />
        </div>
        <div />
        {breaks.map((row, i) => (
          <BreakRowField
            key={i}
            index={i}
            row={row}
            idPrefix={idPrefix}
            onChange={(idx, field, value) =>
              onBreaksChange(updateBreakRow(breaks, idx, field, value))
            }
            onRemove={(idx) => onBreaksChange(removeBreakRow(breaks, idx))}
          />
        ))}
      </div>
      {breaks.length < 6 && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="inline-flex h-auto w-fit items-center gap-1 p-0 text-xs text-primary/70 hover:text-primary"
          onClick={() => onBreaksChange(addBreakRow(breaks))}
          data-testid={`${idPrefix}-btn-add-break`}
        >
          + перерыв
        </Button>
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Локация</Label>
        <Select value={branchId} onValueChange={(value) => value && onBranchChange(value)}>
          <SelectTrigger
            className="h-8"
            displayLabel={branches.find((branch) => branch.id === branchId)?.title}
            data-testid={`${idPrefix}-branch`}
          />
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id} label={branch.title}>
                {branch.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScheduleFooterActions — WORK-07 footer pair of a schedule form
// ---------------------------------------------------------------------------

type ScheduleFooterActionsProps = {
  clearLabel: string;
  clearDisabled: boolean;
  saveDisabled: boolean;
  onClear: () => void;
  onSave: () => void;
  clearTestId: string;
  saveTestId: string;
};

/** WORK-07: «Очистить …» слева, «Сохранить» справа, равной ширины — в панели и в модалке. */
function ScheduleFooterActions({
  clearLabel,
  clearDisabled,
  saveDisabled,
  onClear,
  onSave,
  clearTestId,
  saveTestId,
}: ScheduleFooterActionsProps) {
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn('w-full', DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS)}
        disabled={clearDisabled}
        onClick={onClear}
        data-testid={clearTestId}
      >
        {clearLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={saveDisabled}
        onClick={onSave}
        data-testid={saveTestId}
      >
        Сохранить
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// ScheduleWorkTab
// ---------------------------------------------------------------------------

/** Таб «График работы» раздела «Расписание» — per-date редактор. E1–E5. */
export function ScheduleWorkTab({ deepLinkParams, onDeepLinkChange, isActive }: ScheduleTabProps) {
  // ── State ─────────────────────────────────────────────────────────────────

  const [selectionMode, setSelectionMode] = useState<'dates' | 'weekday'>('dates');
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);
  // #232: «постоянное расписание» чекбокс УДАЛЁН — weekday selection всегда сохраняет
  // как постоянное (weekday template), а разовые исключения делаются через dates-режим.

  const { year, month } = parseMonth(deepLinkParams.month);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);

  const [branches, setBranches] = useState<Branch[]>([]);
  // UI-1b: location filters are independent; bootstrap selects every location.
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  const [specialistId, setSpecialistId] = useState('');

  const [dayRecords, setDayRecords] = useState<WorkingDayRecord[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplateRecord[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHoursRow[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedPrimaryDate, setSelectedPrimaryDate] = useState<string | null>(null);
  const lastClickedRef = useRef<string | null>(null);
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);

  // Panel state (E4 — строчная раскладка + N перерывов)
  const [panelStart, setPanelStart] = useState(DEFAULT_PANEL_START);
  const [panelEnd, setPanelEnd] = useState(DEFAULT_PANEL_END);
  const [panelBreaks, setPanelBreaks] = useState<BreakRow[]>([]);
  const [panelBranchId, setPanelBranchId] = useState('');

  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // E5 — Create template dialog with N breaks
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  // WORK-08: редактирование сохранённого недельного шаблона открывается прямо из его плашки.
  const [weekdayModalOpen, setWeekdayModalOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const monthPickerActiveRef = useRef<HTMLButtonElement>(null);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplStart, setTplStart] = useState(DEFAULT_PANEL_START);
  const [tplEnd, setTplEnd] = useState(DEFAULT_PANEL_END);
  const [tplBreaks, setTplBreaks] = useState<BreakRow[]>([]);
  const [tplBranchId, setTplBranchId] = useState('');

  // ── Today string ─────────────────────────────────────────────────────────

  const today = DateTime.now().toISODate() ?? '';
  const monthChoices = useMemo(() => {
    const currentYear = DateTime.now().year;
    return Array.from({ length: 11 * 12 }, (_, index) => {
      const year = currentYear - 5 + Math.floor(index / 12);
      const month = (index % 12) + 1;
      return { year, month, value: formatMonth(year, month) };
    });
  }, []);
  const currentMonthValue = DateTime.now().toFormat('yyyy-MM');

  useEffect(() => {
    if (!monthPickerOpen) return;
    const frame = window.requestAnimationFrame(() => {
      monthPickerActiveRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [monthPickerOpen, viewMonth, viewYear]);

  // ── Deep-link sync ────────────────────────────────────────────────────────

  const resetGridSelection = useCallback(() => {
    setSelected(new Set());
    setSelectedPrimaryDate(null);
    lastClickedRef.current = null;
    setSelectionMode('dates');
    setSelectedWeekday(null);
    setActionError(null);
  }, []);

  const syncLocationDeepLink = useCallback(
    (ids: Set<string>) => {
      const onlyId = ids.size === 1 ? ids.values().next().value : undefined;
      onDeepLinkChange('location', typeof onlyId === 'string' ? onlyId : null);
      if (typeof onlyId === 'string') setPanelBranchId(onlyId);
    },
    [onDeepLinkChange],
  );

  const toggleGridBranch = useCallback(
    (id: string) => {
      const next = new Set(selectedBranchIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedBranchIds(next);
      resetGridSelection();
      syncLocationDeepLink(next);
    },
    [resetGridSelection, selectedBranchIds, syncLocationDeepLink],
  );

  const selectAllGridBranches = useCallback(() => {
    const next = new Set(branches.map((branch) => branch.id));
    setSelectedBranchIds(next);
    resetGridSelection();
    syncLocationDeepLink(next);
  }, [branches, resetGridSelection, syncLocationDeepLink]);

  const navigateMonth = useCallback(
    (delta: number) => {
      let m = viewMonth + delta;
      let y = viewYear;
      if (m > 12) {
        m = 1;
        y++;
      }
      if (m < 1) {
        m = 12;
        y--;
      }
      setViewYear(y);
      setViewMonth(m);
      if (!multiSelectEnabled) {
        setSelected(new Set());
        setSelectedPrimaryDate(null);
        lastClickedRef.current = null;
      }
      onDeepLinkChange('month', formatMonth(y, m));
    },
    [multiSelectEnabled, viewMonth, viewYear, onDeepLinkChange],
  );

  const selectMonth = useCallback(
    (year: number, month: number) => {
      setViewYear(year);
      setViewMonth(month);
      if (!multiSelectEnabled) resetGridSelection();
      onDeepLinkChange('month', formatMonth(year, month));
      setMonthPickerOpen(false);
    },
    [multiSelectEnabled, onDeepLinkChange, resetGridSelection],
  );

  // ── Load all working days for visible month; location selection is composed client-side. ──

  const loadMonth = useCallback(() => {
    if (!specialistId) return;
    const dateFrom = monthStart(viewYear, viewMonth);
    const dateTo = monthEnd(viewYear, viewMonth);
    startTransition(async () => {
      const qs = new URLSearchParams({ dateFrom, dateTo, specialistId });
      try {
        const json = await apiJson<{ ok: boolean; rows: WorkingDayRecord[] }>(
          `${WD_BASE}?${qs.toString()}`,
        );
        setDayRecords(json.rows ?? []);
        setLoadError(null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'load_failed');
      }
    });
  }, [specialistId, viewYear, viewMonth]);

  const loadTemplates = useCallback(() => {
    startTransition(async () => {
      try {
        const json = await apiJson<{ ok: boolean; rows: ScheduleTemplateRecord[] }>(TPL_BASE);
        setTemplates(json.rows ?? []);
      } catch {
        // non-fatal; templates panel just stays empty
      }
    });
  }, []);

  const loadWorkingHours = useCallback(() => {
    if (!specialistId) return;
    startTransition(async () => {
      try {
        const qs = new URLSearchParams({ specialistId });
        const json = await apiJson<{ ok: boolean; rows: WorkingHoursRow[] }>(
          `${WH_BASE}?${qs.toString()}`,
        );
        setWorkingHours(json.rows ?? []);
      } catch {
        // non-fatal
      }
    });
  }, [specialistId]);

  // ── Bootstrap (specialist + overview) ────────────────────────────────────

  useEffect(() => {
    startTransition(async () => {
      try {
        const bootstrap = await fetchDoctorScheduleBootstrap();
        if (!bootstrap) {
          setLoadError('booking_engine_unavailable');
          return;
        }
        setBranches(bootstrap.branches);
        if (!bootstrap.specialistId) {
          setLoadError('specialist_not_configured');
          return;
        }
        setSpecialistId(bootstrap.specialistId);
        // UI-1b: a deep link selects one location; otherwise every location is enabled.
        const savedId = deepLinkParams.location ?? '';
        const resolvedBranch = bootstrap.branches.find((b) => b.id === savedId);
        setSelectedBranchIds(
          new Set(
            resolvedBranch ? [resolvedBranch.id] : bootstrap.branches.map((branch) => branch.id),
          ),
        );
        // Panel branch default: from deep-link or first active
        const panelDefault = resolvedBranch ?? bootstrap.branches[0];
        if (panelDefault) {
          setPanelBranchId(panelDefault.id);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'load_failed');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (specialistId) {
      loadMonth();
      loadTemplates();
      loadWorkingHours();
    }
  }, [specialistId, loadMonth, loadTemplates, loadWorkingHours]);

  // Refresh on re-activation
  useEffect(() => {
    if (!isActive || !specialistId) return;
    loadMonth();
    loadTemplates();
    loadWorkingHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Location-filtered source rows ─────────────────────────────────────────
  // Живут выше обработчиков: и выбор дня недели, и панель часов читают именно отфильтрованные
  // строки, а обращение к ним из useCallback-зависимостей ниже объявления упало бы в TDZ.

  const allBranchesSelected =
    branches.length > 0 && branches.every((branch) => selectedBranchIds.has(branch.id));
  const visibleDayRecords = useMemo(
    () =>
      dayRecords.filter((record) => {
        if (allBranchesSelected) return true;
        return record.branchId === null || selectedBranchIds.has(record.branchId);
      }),
    [allBranchesSelected, dayRecords, selectedBranchIds],
  );
  const visibleWorkingHours = useMemo(
    () =>
      workingHours.filter((row) => {
        if (allBranchesSelected) return true;
        return row.branchId === null || selectedBranchIds.has(row.branchId);
      }),
    [allBranchesSelected, selectedBranchIds, workingHours],
  );
  const dayMap = useMemo(
    () => new Map(visibleDayRecords.map((r) => [r.workDate, r])),
    [visibleDayRecords],
  );

  // ── Day selection ─────────────────────────────────────────────────────────

  const gridDates = buildMonthGrid(viewYear, viewMonth).filter((d): d is string => d !== null);

  const toggleDay = useCallback(
    (date: string, shift: boolean, meta: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        let nextPrimaryDate = selectedPrimaryDate;
        if (shift && lastClickedRef.current) {
          const from = lastClickedRef.current;
          const [a, b] = from < date ? [from, date] : [date, from];
          for (const d of gridDates) {
            if (d >= a && d <= b) next.add(d);
          }
          nextPrimaryDate = nextPrimaryDate ?? date;
        } else if (meta || multiSelectEnabled) {
          if (next.has(date)) {
            next.delete(date);
            if (nextPrimaryDate === date) {
              const fallback = next.values().next().value;
              nextPrimaryDate = typeof fallback === 'string' ? fallback : null;
            }
          } else {
            next.add(date);
            nextPrimaryDate = nextPrimaryDate ?? date;
          }
        } else {
          if (next.size === 1 && next.has(date)) {
            next.clear();
            nextPrimaryDate = null;
          } else {
            next.clear();
            next.add(date);
            nextPrimaryDate = date;
          }
        }
        setSelectedPrimaryDate(nextPrimaryDate);
        return next;
      });
      lastClickedRef.current = date;
      setSelectionMode('dates');
      setSelectedWeekday(null);
    },
    [gridDates, multiSelectEnabled, selectedPrimaryDate],
  );

  const handleWeekdayHeaderClick = useCallback(
    (colIndex: number) => {
      const wd = [1, 2, 3, 4, 5, 6, 0][colIndex]!;
      // WORK-08: у дня недели уже есть сохранённый недельный шаблон → сразу его модалка
      // редактирования, без промежуточного выбора дат и применения.
      if (resolvePanelDefaultsForWeekday(wd, visibleWorkingHours)) {
        setSelected(new Set());
        setSelectedPrimaryDate(null);
        lastClickedRef.current = null;
        setActionError(null);
        setSelectionMode('weekday');
        setSelectedWeekday(wd);
        setWeekdayModalOpen(true);
        return;
      }
      if (selectedWeekday === wd && selectionMode === 'weekday') {
        // Re-click same weekday → deselect
        setSelectionMode('dates');
        setSelectedWeekday(null);
        setSelected(new Set());
        setSelectedPrimaryDate(null);
        return;
      }
      // Select all dates of this weekday in current month view
      const allDates = buildMonthGrid(viewYear, viewMonth).filter((d): d is string => d !== null);
      const matching = new Set(
        allDates.filter((d) => {
          // Luxon weekday: 1=Mon..7=Sun → map to [1,2,3,4,5,6,0] using (luxonWd % 7)
          const luxonWd = DateTime.fromISO(d).weekday;
          const bwHoursWd = luxonWd % 7;
          return bwHoursWd === wd;
        }),
      );
      setSelected(matching);
      setSelectedPrimaryDate([...matching].sort()[0] ?? null);
      setSelectionMode('weekday');
      setSelectedWeekday(wd);
      lastClickedRef.current = null;
    },
    [selectedWeekday, selectionMode, viewYear, viewMonth, visibleWorkingHours],
  );

  const closeWeekdayModal = useCallback(() => {
    setWeekdayModalOpen(false);
    setSelectionMode('dates');
    setSelectedWeekday(null);
    setActionError(null);
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────

  function run(fn: () => Promise<void>, onSuccess?: () => void) {
    setActionError(null);
    startTransition(async () => {
      try {
        await fn();
        await loadMonth();
        loadTemplates();
        loadWorkingHours(); // SCH-R-08: reload template state after every save
        emitDoctorScheduleCalendarRefresh();
        onSuccess?.();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'action_failed');
      }
    });
  }

  // SCH-R-04: save weekday template → POST /working-hours replace=true
  function handleSaveWeekdayTemplate() {
    if (selectedWeekday === null) return;
    let startMinute: number;
    let endMinute: number;
    try {
      startMinute = timeLabelToMinute(panelStart);
      endMinute = timeLabelToMinute(panelEnd);
    } catch {
      setActionError('Неверный формат времени');
      return;
    }
    if (panelBreaks.length > 0) {
      const err = validateBreakRows(panelBreaks, startMinute, endMinute);
      if (err) {
        setActionError(err);
        return;
      }
    }
    const breaks: BreakInterval[] = panelBreaks.map((r) => ({
      startMinute: timeLabelToMinute(r.from),
      endMinute: timeLabelToMinute(r.to),
    }));
    run(
      async () => {
        await apiJson(WH_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekday: selectedWeekday,
            startMinute,
            endMinute,
            specialistId,
            branchId: panelBranchId || undefined,
            replace: true,
          }),
        });
      },
      // WORK-08: модалка закрывается только после успешного сохранения — ошибка остаётся видимой.
      closeWeekdayModal,
    );
  }

  // SCH-R-04: clear weekday template → DELETE each active be_working_hours row for this weekday
  // #233: после очистки сразу сбрасываем выделение и скрываем блок настроек
  function handleClearWeekdayTemplate() {
    if (selectedWeekday === null) return;
    const toDeactivate = visibleWorkingHours.filter(
      (r) => r.weekday === selectedWeekday && r.isActive,
    );
    if (toDeactivate.length === 0) {
      // #233: сбрасываем выделение даже если шаблон уже пуст
      setWeekdayModalOpen(false);
      setSelected(new Set());
      setSelectedPrimaryDate(null);
      setSelectionMode('dates');
      setSelectedWeekday(null);
      lastClickedRef.current = null;
      return;
    }
    // #233: сбрасываем выделение СРАЗУ (до сетевого запроса), чтобы UI реагировал немедленно
    setWeekdayModalOpen(false);
    setSelected(new Set());
    setSelectedPrimaryDate(null);
    setSelectionMode('dates');
    setSelectedWeekday(null);
    lastClickedRef.current = null;
    run(async () => {
      await Promise.all(
        toDeactivate.map((r) =>
          apiJson(`${WH_BASE}?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' }),
        ),
      );
    });
  }

  function handleSave() {
    // SCH-R-04: weekday mode → всегда сохраняем как постоянный шаблон (#232)
    if (selectionMode === 'weekday') {
      handleSaveWeekdayTemplate();
      return;
    }
    const dates = [...selected];
    if (!dates.length) return;
    let startMinute: number;
    let endMinute: number;
    try {
      startMinute = timeLabelToMinute(panelStart);
      endMinute = timeLabelToMinute(panelEnd);
    } catch {
      setActionError('Неверный формат времени');
      return;
    }
    // E4 — validate break rows
    if (panelBreaks.length > 0) {
      const err = validateBreakRows(panelBreaks, startMinute, endMinute);
      if (err) {
        setActionError(err);
        return;
      }
    }
    // Convert BreakRow[] → BreakInterval[]
    const breaks: BreakInterval[] = panelBreaks.map((r) => ({
      startMinute: timeLabelToMinute(r.from),
      endMinute: timeLabelToMinute(r.to),
    }));

    run(async () => {
      await apiJson(WD_BASE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          dates,
          startMinute,
          endMinute,
          breaks,
          specialistId,
          branchId: panelBranchId || undefined,
        }),
      });
      setSelected(new Set());
      setSelectedPrimaryDate(null);
    });
  }

  // §3.15: «Очистить расписание» — удалить сохранённые записи выбранных дней
  // (action:"clear" → DELETE be_working_days). После удаления день падает на
  // weekday-fallback (а не остаётся «закрытым»).
  function handleClearSchedule() {
    // SCH-R-04: weekday mode → deactivate the weekday template
    if (selectionMode === 'weekday') {
      handleClearWeekdayTemplate();
      return;
    }
    const dates = [...selected];
    if (!dates.length) return;
    run(async () => {
      await apiJson(WD_BASE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', dates, specialistId }),
      });
      setSelected(new Set());
      setSelectedPrimaryDate(null);
    });
  }

  function handleClearSelection() {
    setSelected(new Set());
    setSelectedPrimaryDate(null);
    lastClickedRef.current = null;
    setSelectionMode('dates');
    setSelectedWeekday(null);
    setActionError(null);
  }

  function handleApplyTemplate(templateId: string) {
    const dates = [...selected];
    if (!dates.length) {
      setActionError('Выберите дни для применения шаблона');
      return;
    }
    run(async () => {
      await apiJson(`${TPL_BASE}?action=apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, dates, specialistId }),
      });
      setSelected(new Set());
      setSelectedPrimaryDate(null);
    });
  }

  function handleDeleteTemplate(id: string) {
    run(async () => {
      await apiJson(`${TPL_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    });
  }

  function handleCreateTemplate() {
    let startMinute: number;
    let endMinute: number;
    try {
      startMinute = timeLabelToMinute(tplStart);
      endMinute = timeLabelToMinute(tplEnd);
    } catch {
      setActionError('Неверный формат времени в шаблоне');
      return;
    }
    // E5 — validate template breaks
    if (tplBreaks.length > 0) {
      const err = validateBreakRows(tplBreaks, startMinute, endMinute);
      if (err) {
        setActionError(err);
        return;
      }
    }
    const breaks: BreakInterval[] = tplBreaks.map((r) => ({
      startMinute: timeLabelToMinute(r.from),
      endMinute: timeLabelToMinute(r.to),
    }));

    run(async () => {
      await apiJson(TPL_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:
            tplName.trim() || `${minuteToTimeLabel(startMinute)}–${minuteToTimeLabel(endMinute)}`,
          startMinute,
          endMinute,
          breaks,
          branchId: tplBranchId || undefined,
        }),
      });
      setTplDialogOpen(false);
      setTplName('');
      setTplBreaks([]);
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const cells = buildMonthGrid(viewYear, viewMonth);
  const selectedCount = selected.size;
  const selectedDates = [...selected].sort();
  const firstSelectedDate = selectedPrimaryDate ?? selectedDates[0] ?? null;
  const hasScheduleForSelection =
    selectionMode === 'weekday' && selectedWeekday !== null
      ? resolvePanelDefaultsForWeekday(selectedWeekday, visibleWorkingHours) !== null
      : selectedDates.some(
          (date) => resolvePanelDefaultsForDate(date, dayMap, visibleWorkingHours) !== null,
        );

  useEffect(() => {
    if (!firstSelectedDate && selectedWeekday === null) return;
    const defaults =
      selectionMode === 'weekday' && selectedWeekday !== null
        ? resolvePanelDefaultsForWeekday(selectedWeekday, visibleWorkingHours)
        : firstSelectedDate
          ? resolvePanelDefaultsForDate(firstSelectedDate, dayMap, visibleWorkingHours)
          : null;
    if (!defaults) {
      setPanelStart(DEFAULT_PANEL_START);
      setPanelEnd(DEFAULT_PANEL_END);
      setPanelBreaks([]);
      const onlyBranchId =
        selectedBranchIds.size === 1 ? selectedBranchIds.values().next().value : undefined;
      if (typeof onlyBranchId === 'string') {
        setPanelBranchId(onlyBranchId);
      }
      return;
    }
    setPanelStart(minuteToTimeLabel(defaults.startMinute));
    setPanelEnd(minuteToTimeLabel(defaults.endMinute));
    setPanelBreaks(breaksToRows(defaults.breaks));
    if (defaults.branchId) {
      setPanelBranchId(defaults.branchId);
    }
  }, [
    firstSelectedDate,
    selectedWeekday,
    selectionMode,
    dayMap,
    selectedBranchIds,
    visibleWorkingHours,
  ]);

  // E3: branch label for the filter switcher
  function getBranchDisplayLabel(b: Branch): string {
    return branchDisplayLabel(b);
  }

  function handleTopBarMouseDown(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const interactive = target.closest("button,[role='button'],[role='combobox'],a,input,label");
    if (!interactive) {
      handleClearSelection();
    }
  }

  function handleSurfaceMouseDown(e: MouseEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    const interactive = target.closest(
      `button,[role='button'],[role='combobox'],a,input,label,select,textarea,${INTERACTIVE_PORTAL_SELECTOR}`,
    );
    if (!interactive) {
      handleClearSelection();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="schedule-work-tab"
      onMouseDown={handleSurfaceMouseDown}
    >
      {/* Shared schedule toolbar: centered month navigation + branch filter action. */}
      <DoctorCatalogStickyToolbar
        withinRemainingHeight
        className="mt-0 grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1 md:-mt-3"
        onMouseDown={handleTopBarMouseDown}
        data-testid="schedule-work-topbar"
      >
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn(
            DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS,
            allBranchesSelected
              ? DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS
              : DOCTOR_ACTIVE_FILTER_BUTTON_CLASS,
          )}
          onClick={() => setBranchPickerOpen(true)}
          aria-label="Выбрать филиалы"
          title="Филиалы"
          data-testid="branch-filter-open"
        >
          <MapPin className="size-4" aria-hidden />
        </Button>
        <DoctorSchedulePeriodNav
          className="justify-center"
          labelClassName="max-w-48"
          label={`${RU_MONTHS[viewMonth]} ${viewYear}`}
          onPrev={() => navigateMonth(-1)}
          onNext={() => navigateMonth(1)}
          onLabelClick={() => setMonthPickerOpen(true)}
          prevAriaLabel="Предыдущий месяц"
          nextAriaLabel="Следующий месяц"
          labelAriaLabel="Выбрать месяц"
          prevTestId="month-prev"
          nextTestId="month-next"
          labelTestId="month-label"
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn(
            DOCTOR_SCHEDULE_TOOLBAR_ICON_CONTROL_CLASS,
            multiSelectEnabled
              ? DOCTOR_ACTIVE_FILTER_BUTTON_CLASS
              : DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
          )}
          onClick={() => setMultiSelectEnabled((enabled) => !enabled)}
          aria-pressed={multiSelectEnabled}
          aria-label="Выбирать несколько дней"
          title="Выбрать несколько дней"
          data-testid="multi-select-toggle"
        >
          <Layers className="size-4" aria-hidden />
        </Button>
      </DoctorCatalogStickyToolbar>

      <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 md:mx-0 md:px-0 [scrollbar-width:thin]">
        <div className="flex flex-col gap-3 py-3">
          {/* Errors / feedback */}
          {loadError ? (
            <p className="text-sm text-destructive" data-testid="load-error">
              {loadError}
            </p>
          ) : null}
          {actionError ? (
            <p className="text-sm text-destructive" data-testid="action-error">
              {actionError}
            </p>
          ) : null}

          {/* E1: Two-column layout on large screens */}
          {/* #235: клик в стороне от активных элементов (за пределами month-grid и hours-panel)
          сбрасывает выбор. Используем onMouseDown чтобы перехватить раньше дочерних onClick. */}
          <div
            className="grid gap-3 lg:grid-cols-[1fr_320px]"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              // Не сбрасываем если клик внутри month-grid (дни/заголовки) или hours-panel.
              // #829: также не сбрасываем для содержимого Select-дропдауна («Локация»/город) —
              // оно рендерится в портал в document.body (base-ui `Select`), т.е. НЕ является
              // DOM-потомком hours-panel, хотя и остаётся React-потомком (событие всё равно
              // всплывает сюда). Без этого выбор дня недели/дней сбрасывался и панель редактирования
              // пропадала при простом открытии/выборе города.
              const inside = target.closest(
                `[data-testid='month-grid'], [data-testid='hours-panel'], ${INTERACTIVE_PORTAL_SELECTOR}`,
              );
              if (!inside) {
                setSelected(new Set());
                setSelectedPrimaryDate(null);
                setSelectionMode('dates');
                setSelectedWeekday(null);
                lastClickedRef.current = null;
              }
            }}
          >
            {/* LEFT: month grid */}
            <div className="flex flex-col gap-2">
              <div
                className={cn(
                  doctorSectionCardClass,
                  'overflow-hidden p-0',
                )}
                data-testid="month-grid"
              >
                {/* Weekday header — click selects entire weekday column (SCH-R-03) */}
                <div className="grid grid-cols-7 gap-0.5 px-1.5 pb-0.5 pt-1.5 text-center">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, colIndex) => {
                    const wd = [1, 2, 3, 4, 5, 6, 0][colIndex]!;
                    const isActiveWd = selectionMode === 'weekday' && selectedWeekday === wd;
                    const templateSummaries = weekdayTemplateSummaries(wd, visibleWorkingHours);
                    const hasTemplate = templateSummaries.length > 0;
                    const templateBranchId =
                      templateSummaries.find((summary) => summary.branchId)?.branchId ?? null;
                    const templateHex = templateBranchId
                      ? resolveBranchHex(branches, templateBranchId)
                      : null;
                    return (
                      <Button
                        key={d}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleWeekdayHeaderClick(colIndex)}
                        style={templateHex ? branchCellStyle(templateHex, true) : undefined}
                        className={cn(
                          // #236: border как у DayCell — видно что кликабельна
                          'h-auto min-h-8 flex-col gap-0.5 rounded border px-0.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
                          isActiveWd
                            ? 'text-primary font-semibold bg-primary/10 border-primary/40'
                            : templateHex
                              ? // WORK-03: плашка — источник недельного шаблона, поэтому она залита
                                // цветом филиала; унаследовавшие даты ниже остаются только обводкой.
                                'text-foreground bg-[color:var(--branch-bg)] border-[color:var(--branch-border)] hover:bg-[color:var(--branch-hover)]'
                              : hasTemplate
                                ? 'text-foreground bg-primary/10 border-primary/30 hover:bg-primary/15'
                                : 'text-muted-foreground border-border/60 hover:bg-muted/50 hover:text-foreground hover:border-muted-foreground/30',
                        )}
                        aria-label={
                          hasTemplate
                            ? `Изменить постоянное расписание по ${WD_EVERY_LABEL[wd] ?? ''}, ${templateSummaries
                                .map((summary) => summary.label)
                                .join(', ')}`
                            : `Выбрать все ${d} месяца`
                        }
                        aria-pressed={isActiveWd}
                        data-testid={`weekday-header-${wd}`}
                      >
                        <span>{d}</span>
                        {hasTemplate ? (
                          <span
                            className="flex max-w-full min-w-0 flex-col items-center leading-none"
                            data-testid={`weekday-template-summary-${wd}`}
                          >
                            {templateSummaries.map((summary, summaryIndex) => {
                              const summaryHex = summary.branchId
                                ? resolveBranchHex(branches, summary.branchId)
                                : null;
                              return (
                                <span
                                  key={`${summary.label}:${summary.branchId ?? 'none'}:${summaryIndex}`}
                                  className="max-w-full truncate text-[10px] font-normal whitespace-nowrap"
                                  style={summaryHex ? { color: summaryHex } : undefined}
                                >
                                  {summary.label}
                                </span>
                              );
                            })}
                          </span>
                        ) : null}
                      </Button>
                    );
                  })}
                </div>
                {/* Day cells (E2 — компактнее, время крупнее) */}
                <div className="grid grid-cols-7 gap-0.5 p-1.5">
                  {cells.map((dateKey, idx) => (
                    <DayCell
                      key={dateKey ?? `pad-${idx}`}
                      cellIndex={idx}
                      dateKey={dateKey}
                      today={today}
                      branches={branches}
                      isSelected={dateKey ? selected.has(dateKey) : false}
                      onToggle={toggleDay}
                      effectiveHours={
                        dateKey
                          ? resolveEffectiveHours(dateKey, dayMap, visibleWorkingHours)
                          : undefined
                      }
                      scheduleLines={
                        dateKey
                          ? resolveDayScheduleLines(dateKey, dayMap, visibleWorkingHours)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT: hours panel (E4) */}
            <div>
              {selectedCount > 0 ? (
                <DoctorSection
                  className="bg-card"
                  data-testid="hours-panel"
                >
                  <h3 className={doctorSectionTitleClass}>
                    {selectionMode === 'weekday' && selectedWeekday !== null
                      ? `Постоянное расписание по ${WD_EVERY_LABEL[selectedWeekday] ?? ''}`
                      : `Задать расписание для ${selectedCount} ${selectedCount === 1 ? 'дня' : 'дней'} (${
                          selectedDates.length <= 3
                            ? selectedDates
                                .map((d) => {
                                  const dt = DateTime.fromISO(d);
                                  return `${dt.day} ${dt.setLocale('ru').toFormat('LLLL').slice(0, 3)}`;
                                })
                                .join(', ')
                            : `${DateTime.fromISO(selectedDates[0] ?? '').day}–${DateTime.fromISO(selectedDates[selectedDates.length - 1] ?? '').day} …`
                        })`}
                  </h3>

                  {/* #232: чекбокс «постоянное расписание» УДАЛЁН. Выбор дня недели
                  всегда сохраняется как постоянный шаблон weekday. */}

                  {/* WORK-01 — «Начало», «Конец» и перерывы на одной сетке */}
                  <ScheduleFieldsForm
                    idPrefix="panel"
                    branches={branches}
                    start={panelStart}
                    end={panelEnd}
                    breaks={panelBreaks}
                    branchId={panelBranchId}
                    startAriaLabel="Начало рабочего дня"
                    endAriaLabel="Конец рабочего дня"
                    onStartChange={setPanelStart}
                    onEndChange={setPanelEnd}
                    onBreaksChange={setPanelBreaks}
                    onBranchChange={setPanelBranchId}
                  />

                  {/* WORK-07 — «Очистить …» слева, «Сохранить» справа, поровну по ширине */}
                  <div className="grid grid-cols-2 gap-2">
                    <ScheduleFooterActions
                      clearLabel={
                        selectionMode === 'weekday' ? 'Очистить шаблон' : 'Очистить расписание'
                      }
                      clearDisabled={pending || !hasScheduleForSelection}
                      saveDisabled={pending}
                      onClear={handleClearSchedule}
                      onSave={handleSave}
                      clearTestId="btn-clear-schedule"
                      saveTestId="btn-save"
                    />
                  </div>
                </DoctorSection>
              ) : (
                <DoctorSection className="border-dashed">
                  <DoctorEmptyState size="xs">
                    Выберите дни в сетке — появится панель настройки часов.
                  </DoctorEmptyState>
                </DoctorSection>
              )}
            </div>
          </div>

          {/* BOTTOM (full width): templates panel (E5) */}
          <DoctorSection data-testid="templates-panel">
            <div className="flex items-center justify-between gap-2">
              <h3 className={doctorSectionTitleClass}>Шаблоны расписаний</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS}
                onClick={() => {
                  setTplBranchId(panelBranchId);
                  setTplDialogOpen(true);
                }}
                data-testid="btn-create-template"
              >
                + Создать
              </Button>
            </div>

            {templates.length === 0 ? (
              <DoctorEmptyState size="xs">Нет шаблонов.</DoctorEmptyState>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {templates
                  .filter((t) => t.isActive)
                  .map((tpl) => {
                    // E5: short branch label in template
                    const tplBranch = tpl.branchId
                      ? branches.find((b) => b.id === tpl.branchId)
                      : undefined;
                    const tplBranchLabel = tplBranch
                      ? (tplBranch.shortTitle ?? tplBranch.title)
                      : null;
                    const tplBreaksSummary = formatBreakSummary(tpl.breaks ?? []);

                    return (
                      <li
                        key={tpl.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
                        data-testid={`template-${tpl.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="truncate text-sm">{tpl.name}</span>
                          {(tplBranchLabel || tplBreaksSummary) && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {[tplBranchLabel, tplBreaksSummary].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              'h-7 px-2 text-xs',
                              DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
                            )}
                            disabled={pending || selectedCount === 0}
                            title={selectedCount === 0 ? 'Выберите дни для применения' : undefined}
                            onClick={() => handleApplyTemplate(tpl.id)}
                            data-testid={`btn-apply-template-${tpl.id}`}
                          >
                            Применить
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={pending}
                            onClick={() => handleDeleteTemplate(tpl.id)}
                            data-testid={`btn-delete-template-${tpl.id}`}
                          >
                            ×
                          </Button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}

            {selectedCount === 0 && templates.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Выберите дни для применения шаблона.
              </p>
            )}
          </DoctorSection>
        </div>
      </div>

      {/* E5: Create template dialog with N breaks */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать шаблон расписания</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1">
              <Label htmlFor="tpl-name" className="text-xs">
                Название
              </Label>
              <Input
                id="tpl-name"
                className="h-8"
                placeholder="СПб день · 11–19"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                data-testid="tpl-name"
              />
            </div>
            <ScheduleFieldsForm
              idPrefix="tpl"
              branches={branches}
              start={tplStart}
              end={tplEnd}
              breaks={tplBreaks}
              branchId={tplBranchId}
              startAriaLabel="Начало шаблона"
              endAriaLabel="Конец шаблона"
              onStartChange={setTplStart}
              onEndChange={setTplEnd}
              onBreaksChange={setTplBreaks}
              onBranchChange={setTplBranchId}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTplDialogOpen(false);
                setTplBreaks([]);
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={handleCreateTemplate}
              data-testid="btn-create-template-submit"
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WORK-08: тап по сохранённому недельному шаблону открывает его редактирование напрямую. */}
      <DoctorModal
        open={weekdayModalOpen && selectedWeekday !== null}
        onClose={closeWeekdayModal}
        title={`Постоянное расписание по ${
          selectedWeekday === null ? '' : (WD_EVERY_LABEL[selectedWeekday] ?? '')
        }`}
        size="md"
        footer={
          <ScheduleFooterActions
            clearLabel="Очистить шаблон"
            clearDisabled={pending || !hasScheduleForSelection}
            saveDisabled={pending}
            onClear={handleClearWeekdayTemplate}
            onSave={handleSaveWeekdayTemplate}
            clearTestId="weekday-btn-clear-template"
            saveTestId="weekday-btn-save"
          />
        }
      >
        <div className="flex flex-col gap-3">
          {actionError ? (
            <p className="text-sm text-destructive" data-testid="weekday-action-error">
              {actionError}
            </p>
          ) : null}
          <ScheduleFieldsForm
            idPrefix="weekday"
            branches={branches}
            start={panelStart}
            end={panelEnd}
            breaks={panelBreaks}
            branchId={panelBranchId}
            startAriaLabel="Начало рабочего дня"
            endAriaLabel="Конец рабочего дня"
            onStartChange={setPanelStart}
            onEndChange={setPanelEnd}
            onBreaksChange={setPanelBreaks}
            onBranchChange={setPanelBranchId}
          />
        </div>
      </DoctorModal>

      <DoctorModal
        open={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        title="Выбрать месяц"
        size="sm"
        bodyVariant="list"
      >
        <div className="py-1" role="listbox">
          {monthChoices.map((choice) => {
            const active = choice.year === viewYear && choice.month === viewMonth;
            const isPast = choice.value < currentMonthValue;
            return (
              <Button
                key={choice.value}
                ref={active ? monthPickerActiveRef : undefined}
                type="button"
                variant="ghost"
                className={cn(
                  'h-10 w-full justify-between rounded-none px-4 text-sm font-normal',
                  isPast && !active && 'text-muted-foreground/60',
                  active && 'bg-primary/10 font-medium text-primary',
                )}
                onClick={() => selectMonth(choice.year, choice.month)}
                role="option"
                aria-selected={active}
              >
                <span>
                  {RU_MONTHS[choice.month]} {choice.year}
                </span>
                {active ? <Check className="size-4" aria-hidden /> : null}
              </Button>
            );
          })}
        </div>
      </DoctorModal>

      <DoctorModal
        open={branchPickerOpen}
        onClose={() => setBranchPickerOpen(false)}
        title="Филиалы"
        size="sm"
        bodyClassName="p-0"
      >
        <div className="py-1" role="group" aria-label="Фильтр по филиалу">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'h-11 w-full justify-between rounded-none px-4 font-normal',
              allBranchesSelected && 'bg-primary/10 font-medium text-primary',
            )}
            onClick={selectAllGridBranches}
            aria-pressed={allBranchesSelected}
            data-testid="branch-filter-all"
          >
            <span>Все филиалы</span>
            {allBranchesSelected ? <Check className="size-4" aria-hidden /> : null}
          </Button>
          {branches.map((branch) => {
            const branchHex = resolveBranchHex(branches, branch.id);
            const active = selectedBranchIds.has(branch.id);
            return (
              <Button
                key={branch.id}
                type="button"
                variant="ghost"
                className="h-11 w-full justify-between rounded-none px-4 font-normal"
                onClick={() => toggleGridBranch(branch.id)}
                aria-pressed={active}
                data-testid={`branch-btn-${branch.id}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: branchHex }}
                    aria-hidden
                  />
                  <span className="truncate">{getBranchDisplayLabel(branch)}</span>
                </span>
                {active ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
              </Button>
            );
          })}
        </div>
      </DoctorModal>
    </div>
  );
}
