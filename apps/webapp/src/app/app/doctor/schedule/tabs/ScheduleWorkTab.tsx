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
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { DOCTOR_CATALOG_STICKY_BAR_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { DoctorDateTimePicker } from '@/shared/ui/doctor/DoctorDateTimePicker';
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
// never mistaken for a "click outside" that should clear the in-progress selection.
const INTERACTIVE_PORTAL_SELECTOR = "[data-slot^='select'],[data-slot^='popover']";

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

function branchStyle(hex: string, active = false): CSSProperties {
  return {
    '--branch-bg': rgba(hex, active ? 0.16 : 0.08),
    '--branch-hover': rgba(hex, active ? 0.2 : 0.12),
    '--branch-border': rgba(hex, active ? 0.36 : 0.22),
    '--branch-fg': hex,
  } as CSSProperties;
}

function branchDisplayLabel(branch: Branch): string {
  return branch.shortTitle ?? branch.title;
}

function weekdayTemplateSummaries(
  weekday: number,
  workingHours: WorkingHoursRow[],
  branches: Branch[],
): string[] {
  return workingHours
    .filter((row) => row.weekday === weekday && row.isActive)
    .map((row) => {
      const branch = row.branchId ? branches.find((item) => item.id === row.branchId) : undefined;
      const location = branch ? branchDisplayLabel(branch) : null;
      const hours = formatHourRange(row.startMinute, row.endMinute);
      return location ? `${hours} · ${location}` : hours;
    })
    .filter((summary, index, all) => all.indexOf(summary) === index);
}

// ---------------------------------------------------------------------------
// Month grid cell (E2 — narrower, bigger time, shortTitle)
// ---------------------------------------------------------------------------

type DayCellProps = {
  cellIndex?: number;
  dateKey: string | null;
  today: string;
  record: WorkingDayRecord | undefined;
  branches: Branch[];
  isSelected: boolean;
  onToggle: (date: string, shift: boolean, meta: boolean) => void;
  effectiveHours?: EffectiveHours;
};

function DayCell({
  cellIndex,
  dateKey,
  today,
  record,
  branches,
  isSelected,
  onToggle,
  effectiveHours,
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
  const hasSchedule =
    record?.startMinute != null ||
    effectiveHours?.source === 'override' ||
    effectiveHours?.source === 'template';
  const effectiveBranchId =
    record?.branchId ??
    (effectiveHours?.source === 'override' || effectiveHours?.source === 'template'
      ? effectiveHours.branchId
      : null);
  const branchHex =
    hasSchedule && effectiveBranchId ? resolveBranchHex(branches, effectiveBranchId) : undefined;

  // Resolved breaks for display
  const breaks = record ? resolveBreaks(record) : [];

  let cellClass =
    'rounded-md border p-1 min-h-[52px] cursor-pointer select-none transition-colors ';

  if (branchHex) {
    // Location colour remains the base surface for every scheduled day,
    // including weekday-template rows. Selection/today are additive rings so
    // they do not erase the location signal.
    cellClass +=
      'bg-[color:var(--branch-bg)] border-[color:var(--branch-border)] hover:bg-[color:var(--branch-hover)] ';
    if (isSelected) cellClass += 'ring-1 ring-primary/60 ';
    else if (isToday) cellClass += 'ring-1 ring-emerald-500/50 ';
  } else if (isSelected) {
    cellClass += 'bg-primary/15 border-primary/40 ring-1 ring-primary/40 ';
  } else if (isToday) {
    // §3.17 / §3.10–3.12: muted transparent-green «сегодня» (no yellow).
    cellClass += 'bg-emerald-500/10 border-emerald-500/30 ';
  } else if (effectiveHours?.source === 'override') {
    // SCH-R-06: override = light blue tint
    cellClass += 'bg-primary/10 border-primary/20 hover:bg-primary/15 ';
  } else if (effectiveHours?.source === 'closed') {
    // SCH-R-06: closed/выходной = light red tint
    cellClass += 'bg-destructive/5 border-destructive/15 hover:bg-destructive/10 ';
  } else {
    cellClass += 'bg-card border-border/60 hover:bg-muted/30 ';
  }

  const day = DateTime.fromISO(dateKey).day;

  // Per-date overrides keep their local details. Weekday-template time/location
  // live once in the corresponding weekday header instead of repeating here.
  const branchForRecord = effectiveBranchId
    ? branches.find((b) => b.id === effectiveBranchId)
    : undefined;
  const branchShortLabel =
    branchForRecord && effectiveHours?.source !== 'template'
      ? (branchForRecord.shortTitle ?? branchForRecord.title.split(' ')[0] ?? branchForRecord.title)
      : null;
  const displayStartMinute =
    effectiveHours?.source === 'override'
      ? effectiveHours.startMinute
      : (record?.startMinute ?? null);
  const displayEndMinute =
    effectiveHours?.source === 'override' ? effectiveHours.endMinute : (record?.endMinute ?? null);

  return (
    <div
      role="button"
      tabIndex={0}
      className={cellClass}
      aria-pressed={isSelected}
      aria-label={`${dateKey}${hasSchedule ? ` ${formatHourRange(displayStartMinute, displayEndMinute)}` : ''}`}
      style={branchHex ? branchStyle(branchHex) : undefined}
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
          'text-[11px] font-semibold leading-none',
          isSelected
            ? 'text-primary'
            : isToday
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-foreground',
        )}
      >
        {isSelected ? `${day} ●` : day}
      </div>
      {effectiveHours?.source === 'override' && effectiveHours.startMinute != null && (
        <div
          className={cn(
            'mt-0.5 text-[11px] font-semibold leading-none',
            branchHex ? 'text-[color:var(--branch-fg)]' : 'text-primary',
          )}
        >
          {formatHourRange(effectiveHours.startMinute, effectiveHours.endMinute)}
        </div>
      )}
      {effectiveHours?.source === 'closed' && (
        <div className="mt-0.5 text-[10px] leading-none text-destructive/70">выходной</div>
      )}
      {/* Keep existing block for backward compat when effectiveHours not passed */}
      {!effectiveHours &&
        hasSchedule &&
        record?.startMinute != null &&
        record?.endMinute != null && (
          <div
            className={cn(
              'mt-0.5 text-[11px] font-semibold leading-none',
              branchHex ? 'text-[color:var(--branch-fg)]' : 'text-primary',
            )}
          >
            {formatHourRange(record.startMinute, record.endMinute)}
          </div>
        )}
      {branchShortLabel && hasSchedule && (
        <div className="mt-0.5 text-[9px] text-muted-foreground leading-none truncate">
          {branchShortLabel}
        </div>
      )}
      {hasSchedule && breaks.length > 0 && (
        <div className="mt-0.5 text-[9px] text-muted-foreground leading-none truncate">
          {formatBreakSummary(breaks)}
        </div>
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
  onChange: (idx: number, field: 'from' | 'to', value: string) => void;
  onRemove: (idx: number) => void;
};

function BreakRowField({ index, row, onChange, onRemove }: BreakRowFieldProps) {
  return (
    <div className="flex items-center gap-1.5" data-testid={`break-row-${index}`}>
      <span className="text-xs text-muted-foreground min-w-[60px]">Перерыв {index + 1}</span>
      <DoctorDateTimePicker
        mode="time"
        className="h-7 w-24 text-xs"
        value={row.from}
        onChange={(value) => onChange(index, 'from', value)}
        ariaLabel={`Начало перерыва ${index + 1}`}
        testId={`break-from-${index}`}
      />
      <span className="text-xs text-muted-foreground">–</span>
      <DoctorDateTimePicker
        mode="time"
        className="h-7 w-24 text-xs"
        value={row.to}
        onChange={(value) => onChange(index, 'to', value)}
        ariaLabel={`Конец перерыва ${index + 1}`}
        testId={`break-to-${index}`}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(index)}
        aria-label={`Удалить перерыв ${index + 1}`}
        data-testid={`break-remove-${index}`}
      >
        ×
      </Button>
    </div>
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
  const [tplName, setTplName] = useState('');
  const [tplStart, setTplStart] = useState(DEFAULT_PANEL_START);
  const [tplEnd, setTplEnd] = useState(DEFAULT_PANEL_END);
  const [tplBreaks, setTplBreaks] = useState<BreakRow[]>([]);

  // ── Today string ─────────────────────────────────────────────────────────

  const today = DateTime.now().toISODate() ?? '';

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
      setSelected(new Set());
      setSelectedPrimaryDate(null);
      lastClickedRef.current = null;
      onDeepLinkChange('month', formatMonth(y, m));
    },
    [viewMonth, viewYear, onDeepLinkChange],
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
        } else if (meta) {
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
    [gridDates, selectedPrimaryDate],
  );

  const handleWeekdayHeaderClick = useCallback(
    (colIndex: number) => {
      const wd = [1, 2, 3, 4, 5, 6, 0][colIndex]!;
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
    [selectedWeekday, selectionMode, viewYear, viewMonth],
  );

  // ── Break rows helpers ────────────────────────────────────────────────────

  function updateBreakRow(
    rows: BreakRow[],
    idx: number,
    field: 'from' | 'to',
    value: string,
  ): BreakRow[] {
    return rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
  }

  function removeBreakRow(rows: BreakRow[], idx: number): BreakRow[] {
    return rows.filter((_, i) => i !== idx);
  }

  function addBreakRow(rows: BreakRow[]): BreakRow[] {
    return [...rows, { from: '13:00', to: '14:00' }];
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  // ── Weekday label lookup (0=Вс,1=Пн..6=Сб) ──────────────────────────────
  const WD_LABEL: Record<number, string> = {
    0: 'Вс',
    1: 'Пн',
    2: 'Вт',
    3: 'Ср',
    4: 'Чт',
    5: 'Пт',
    6: 'Сб',
  };

  function run(fn: () => Promise<void>) {
    setActionError(null);
    startTransition(async () => {
      try {
        await fn();
        await loadMonth();
        loadTemplates();
        loadWorkingHours(); // SCH-R-08: reload template state after every save
        emitDoctorScheduleCalendarRefresh();
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
    run(async () => {
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
    });
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
      setSelected(new Set());
      setSelectedPrimaryDate(null);
      setSelectionMode('dates');
      setSelectedWeekday(null);
      lastClickedRef.current = null;
      return;
    }
    // #233: сбрасываем выделение СРАЗУ (до сетевого запроса), чтобы UI реагировал немедленно
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
          branchId: panelBranchId || undefined,
        }),
      });
      setTplDialogOpen(false);
      setTplName('');
      setTplBreaks([]);
    });
  }

  // ── Derived ───────────────────────────────────────────────────────────────

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
    <DoctorSection data-testid="schedule-work-tab" onMouseDown={handleSurfaceMouseDown}>
      {/* Sticky top bar: filter (E3) + month nav */}
      <div
        className={`${DOCTOR_CATALOG_STICKY_BAR_CLASS} flex flex-wrap items-center gap-2`}
        onMouseDown={handleTopBarMouseDown}
        data-testid="schedule-work-topbar"
      >
        {/* UI-1b: independent location filters; «Все» restores every location. */}
        <div
          className="flex flex-wrap items-center gap-1"
          role="group"
          aria-label="Фильтр по филиалу"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectAllGridBranches}
            className={cn(
              'inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors',
              allBranchesSelected
                ? 'border-primary/25 bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/60',
            )}
            aria-pressed={allBranchesSelected}
            data-testid="branch-filter-all"
          >
            Все
          </Button>
          {branches.map((b) => {
            const branchHex = resolveBranchHex(branches, b.id);
            const isActive = selectedBranchIds.has(b.id);
            return (
              <Button
                key={b.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleGridBranch(b.id)}
                style={isActive ? branchStyle(branchHex, true) : undefined}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-[color:var(--branch-border)] bg-[color:var(--branch-bg)] text-[color:var(--branch-fg)]'
                    : 'border-border text-muted-foreground hover:bg-muted/60',
                )}
                aria-pressed={isActive}
                data-testid={`branch-btn-${b.id}`}
              >
                ● {getBranchDisplayLabel(b)}
              </Button>
            );
          })}
        </div>

        {/* Month nav */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigateMonth(-1)}
            aria-label="Предыдущий месяц"
            data-testid="month-prev"
          >
            ◀
          </Button>
          <span
            className="min-w-[120px] text-center text-sm font-semibold"
            data-testid="month-label"
          >
            {RU_MONTHS[viewMonth]} {viewYear}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigateMonth(1)}
            aria-label="Следующий месяц"
            data-testid="month-next"
          >
            ▶
          </Button>
        </div>
      </div>

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
      <>
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
              className={cn(doctorSectionCardClass, 'p-0 overflow-hidden')}
              data-testid="month-grid"
            >
              {/* Weekday header — click selects entire weekday column (SCH-R-03) */}
              <div className="grid grid-cols-7 gap-0.5 px-1.5 pb-0.5 pt-1.5 text-center">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d, colIndex) => {
                  const wd = [1, 2, 3, 4, 5, 6, 0][colIndex]!;
                  const isActiveWd = selectionMode === 'weekday' && selectedWeekday === wd;
                  const templateSummaries = weekdayTemplateSummaries(
                    wd,
                    visibleWorkingHours,
                    branches,
                  );
                  return (
                    <Button
                      key={d}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleWeekdayHeaderClick(colIndex)}
                      className={cn(
                        // #236: border как у DayCell — видно что кликабельна
                        'h-auto min-h-8 flex-col gap-0.5 rounded border px-0.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
                        isActiveWd
                          ? 'text-primary font-semibold bg-primary/10 border-primary/40'
                          : 'text-muted-foreground border-border/60 hover:bg-muted/50 hover:text-foreground hover:border-muted-foreground/30',
                      )}
                      aria-label={`Выбрать все ${d} месяца${templateSummaries.length > 0 ? `, ${templateSummaries.join(', ')}` : ''}`}
                      aria-pressed={isActiveWd}
                      data-testid={`weekday-header-${wd}`}
                    >
                      <span>{d}</span>
                      {templateSummaries.length > 0 ? (
                        <span
                          className="max-w-full truncate text-[9px] font-normal leading-none text-muted-foreground"
                          data-testid={`weekday-template-summary-${wd}`}
                        >
                          {templateSummaries.join('; ')}
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
                    record={dateKey ? dayMap.get(dateKey) : undefined}
                    branches={branches}
                    isSelected={dateKey ? selected.has(dateKey) : false}
                    onToggle={toggleDay}
                    effectiveHours={
                      dateKey
                        ? resolveEffectiveHours(dateKey, dayMap, visibleWorkingHours)
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
              <DoctorSection className="border-primary/40 bg-primary/5" data-testid="hours-panel">
                <h3 className={cn(doctorSectionTitleClass, 'text-primary')}>
                  {selectionMode === 'weekday' && selectedWeekday !== null
                    ? `Расписание для всех ${WD_LABEL[selectedWeekday] ?? ''} (${selectedCount} дн.)`
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

                {/* E4 — строчная раскладка */}
                <div className="flex flex-col gap-2">
                  {/* Start / End row */}
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="panel-start" className="text-xs">
                        Начало
                      </Label>
                      <DoctorDateTimePicker
                        mode="time"
                        id="panel-start"
                        className="w-26"
                        value={panelStart}
                        onChange={setPanelStart}
                        ariaLabel="Начало рабочего дня"
                        testId="panel-start"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="panel-end" className="text-xs">
                        Конец
                      </Label>
                      <DoctorDateTimePicker
                        mode="time"
                        id="panel-end"
                        className="w-26"
                        value={panelEnd}
                        onChange={setPanelEnd}
                        ariaLabel="Конец рабочего дня"
                        testId="panel-end"
                      />
                    </div>
                  </div>

                  {/* E4 — Break rows */}
                  <div className="flex flex-col gap-1.5" data-testid="panel-breaks">
                    {panelBreaks.map((row, i) => (
                      <BreakRowField
                        key={i}
                        index={i}
                        row={row}
                        onChange={(idx, field, val) =>
                          setPanelBreaks(updateBreakRow(panelBreaks, idx, field, val))
                        }
                        onRemove={(idx) => setPanelBreaks(removeBreakRow(panelBreaks, idx))}
                      />
                    ))}
                    {panelBreaks.length < 6 && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-0.5 w-fit h-auto p-0"
                        onClick={() => setPanelBreaks(addBreakRow(panelBreaks))}
                        data-testid="btn-add-break"
                      >
                        + перерыв
                      </Button>
                    )}
                  </div>

                  {/* Location selector (E3 — in right panel, not filter bar) */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Локация</Label>
                    <Select value={panelBranchId} onValueChange={(v) => v && setPanelBranchId(v)}>
                      <SelectTrigger className="h-8" data-testid="panel-branch">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id} label={b.title}>
                            {b.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={handleSave}
                    data-testid="btn-save"
                  >
                    Установить
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !hasScheduleForSelection}
                    onClick={handleClearSchedule}
                    data-testid="btn-clear-schedule"
                  >
                    {selectionMode === 'weekday' ? 'Очистить шаблон' : 'Очистить расписание'}
                  </Button>
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
              onClick={() => setTplDialogOpen(true)}
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
                          className="h-7 px-2 text-xs"
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
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-start" className="text-xs">
                    Начало
                  </Label>
                  <DoctorDateTimePicker
                    mode="time"
                    id="tpl-start"
                    className="w-28"
                    value={tplStart}
                    onChange={setTplStart}
                    ariaLabel="Начало шаблона"
                    testId="tpl-start"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tpl-end" className="text-xs">
                    Конец
                  </Label>
                  <DoctorDateTimePicker
                    mode="time"
                    id="tpl-end"
                    className="w-28"
                    value={tplEnd}
                    onChange={setTplEnd}
                    ariaLabel="Конец шаблона"
                    testId="tpl-end"
                  />
                </div>
              </div>
              {/* E5 — Template breaks */}
              <div className="flex flex-col gap-1.5" data-testid="tpl-breaks">
                {tplBreaks.map((row, i) => (
                  <BreakRowField
                    key={i}
                    index={i}
                    row={row}
                    onChange={(idx, field, val) =>
                      setTplBreaks(updateBreakRow(tplBreaks, idx, field, val))
                    }
                    onRemove={(idx) => setTplBreaks(removeBreakRow(tplBreaks, idx))}
                  />
                ))}
                {tplBreaks.length < 6 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary mt-0.5 w-fit h-auto p-0"
                    onClick={() => setTplBreaks(addBreakRow(tplBreaks))}
                    data-testid="tpl-btn-add-break"
                  >
                    + перерыв
                  </Button>
                )}
              </div>
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
      </>
    </DoctorSection>
  );
}
