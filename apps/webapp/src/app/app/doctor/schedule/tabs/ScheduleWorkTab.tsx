"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/doctor/primitives/dialog";
import {
  apiJson,
  ensureDefaultSpecialist,
  fetchSoloOverview,
  minuteToTimeLabel,
  timeLabelToMinute,
} from "@/app/app/settings/bookingSoloAdminApi";
import { doctorSectionCardClass, doctorSectionTitleClass, doctorEmptyStateClass } from "@/shared/ui/doctor/doctorVisual";
import { DOCTOR_CATALOG_STICKY_BAR_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { cn } from "@/lib/utils";
import type { ScheduleTabProps } from "../scheduleTabRegistry";

// ---------------------------------------------------------------------------
// API base paths
// ---------------------------------------------------------------------------

const WD_BASE = "/api/admin/booking-engine/working-days";
const TPL_BASE = "/api/admin/booking-engine/working-schedule-templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Branch = { id: string; title: string; isActive: boolean };

type WorkingDayRecord = {
  id: string;
  workDate: string; // YYYY-MM-DD
  startMinute: number | null;
  endMinute: number | null;
  breakStartMinute: number | null;
  breakEndMinute: number | null;
  isClosed: boolean;
  branchId: string | null;
};

type ScheduleTemplateRecord = {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  breakStartMinute: number | null;
  breakEndMinute: number | null;
  branchId: string | null;
  sortOrder: number;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a YYYY-MM-DD string for the 1st day of the given year-month. */
function monthStart(year: number, month: number): string {
  return DateTime.fromObject({ year, month, day: 1 }).toISODate() ?? "";
}

/** Build a YYYY-MM-DD string for the last day of the given year-month. */
function monthEnd(year: number, month: number): string {
  return DateTime.fromObject({ year, month, day: 1 }).endOf("month").toISODate() ?? "";
}

/** Parse "YYYY-MM" from deepLink or produce current month. */
function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y && m && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = DateTime.now();
  return { year: now.year, month: now.month };
}

/** Format year-month as "YYYY-MM". */
function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Russian month names (1-indexed). */
const RU_MONTHS = [
  "", "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** Build the array of calendar cell dates for a full month grid (Mon-first, padded to complete weeks). */
function buildMonthGrid(year: number, month: number): Array<string | null> {
  const first = DateTime.fromObject({ year, month, day: 1 });
  const daysInMonth = first.daysInMonth ?? 30;
  // ISO weekday 1=Mon…7=Sun; padding at start
  const startPad = ((first.weekday - 1 + 7) % 7);
  const cells: Array<string | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(DateTime.fromObject({ year, month, day: d }).toISODate() ?? null);
  }
  // Pad tail to complete last row
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatHourRange(start: number | null, end: number | null): string {
  if (start == null || end == null) return "";
  const sh = Math.floor(start / 60);
  const eh = Math.floor(end / 60);
  return `${sh}–${eh}`;
}

// ---------------------------------------------------------------------------
// Month grid cell
// ---------------------------------------------------------------------------

type DayCellProps = {
  dateKey: string | null;
  today: string;
  record: WorkingDayRecord | undefined;
  branchColorMap: Map<string, string>;
  isSelected: boolean;
  onToggle: (date: string, shift: boolean, meta: boolean) => void;
};

function DayCell({ dateKey, today, record, branchColorMap, isSelected, onToggle }: DayCellProps) {
  if (!dateKey) {
    return <div className="min-h-[58px]" />;
  }

  const isToday = dateKey === today;
  const isClosed = record?.isClosed === true;
  const hasSchedule = !isClosed && record?.startMinute != null;
  const color = hasSchedule && record?.branchId ? branchColorMap.get(record.branchId) : undefined;

  // Color classes for the cell background / border
  let cellClass = "rounded-md border p-1.5 min-h-[58px] cursor-pointer select-none transition-colors ";

  if (isSelected) {
    // Selected — use primary ring regardless of schedule
    cellClass += "bg-primary/15 border-primary/60 ring-1 ring-primary/40 ";
  } else if (isToday) {
    cellClass += "bg-amber-500/10 border-amber-500/50 ";
  } else if (isClosed) {
    cellClass += "bg-muted/40 border-border/40 opacity-60 ";
  } else if (color === "blue") {
    cellClass += "bg-blue-500/10 border-blue-500/50 ";
  } else if (color === "green") {
    cellClass += "bg-green-600/10 border-green-600/50 ";
  } else if (color === "violet") {
    cellClass += "bg-violet-500/10 border-violet-500/50 ";
  } else {
    cellClass += "bg-card border-border hover:bg-muted/30 ";
  }

  const day = DateTime.fromISO(dateKey).day;
  const dotColor =
    color === "blue" ? "text-blue-600"
    : color === "green" ? "text-green-700"
    : color === "violet" ? "text-violet-600"
    : "text-primary";

  return (
    <div
      role="button"
      tabIndex={0}
      className={cellClass}
      aria-pressed={isSelected}
      aria-label={`${dateKey}${record ? (isClosed ? " закрыт" : ` ${formatHourRange(record.startMinute, record.endMinute)}`) : ""}`}
      onClick={(e) => onToggle(dateKey, e.shiftKey, e.metaKey || e.ctrlKey)}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(dateKey, e.shiftKey, e.metaKey || e.ctrlKey); } }}
      data-testid={`day-cell-${dateKey}`}
    >
      <div className={cn("text-[11px] font-semibold leading-none", isSelected ? "text-primary" : isToday ? "text-amber-700" : "text-foreground")}>
        {isSelected ? `${day} ●` : day}
      </div>
      {isClosed && (
        <div className="mt-0.5 text-[9px] text-muted-foreground">закрыт</div>
      )}
      {hasSchedule && record?.startMinute != null && record?.endMinute != null && (
        <div className={cn("mt-0.5 text-[9px] font-semibold leading-none", dotColor)}>
          {formatHourRange(record.startMinute, record.endMinute)}
        </div>
      )}
      {hasSchedule && record?.breakStartMinute != null && record?.breakEndMinute != null && (
        <div className="mt-0.5 text-[8px] text-muted-foreground leading-none">
          обед {Math.floor(record.breakStartMinute / 60)}–{Math.floor(record.breakEndMinute / 60)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScheduleWorkTab
// ---------------------------------------------------------------------------

/** Таб «График работы» раздела «Расписание» — per-date редактор. */
export function ScheduleWorkTab({ deepLinkParams, onDeepLinkChange, isActive }: ScheduleTabProps) {
  // ── State ─────────────────────────────────────────────────────────────────

  const { year, month } = parseMonth(deepLinkParams.month);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string>(() => deepLinkParams.location ?? "");
  const [specialistId, setSpecialistId] = useState("");

  const [dayRecords, setDayRecords] = useState<WorkingDayRecord[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplateRecord[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // For shift-range selection
  const lastClickedRef = useRef<string | null>(null);

  // Panel state
  const [panelStart, setPanelStart] = useState("09:00");
  const [panelEnd, setPanelEnd] = useState("18:00");
  const [panelBreakEnabled, setPanelBreakEnabled] = useState(false);
  const [panelBreakStart, setPanelBreakStart] = useState("13:00");
  const [panelBreakEnd, setPanelBreakEnd] = useState("14:00");
  const [panelBranchId, setPanelBranchId] = useState("");

  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Create template dialog
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplStart, setTplStart] = useState("09:00");
  const [tplEnd, setTplEnd] = useState("18:00");
  const [tplBreakEnabled, setTplBreakEnabled] = useState(false);
  const [tplBreakStart, setTplBreakStart] = useState("13:00");
  const [tplBreakEnd, setTplBreakEnd] = useState("14:00");

  // ── Branch color map (deterministic by index) ───────────────────────────

  const BRANCH_COLORS = ["blue", "green", "violet", "orange"] as const;
  const branchColorMap = new Map<string, string>(
    branches.map((b, i) => [b.id, BRANCH_COLORS[i % BRANCH_COLORS.length] ?? "blue"]),
  );

  // ── Today string ─────────────────────────────────────────────────────────

  const today = DateTime.now().toISODate() ?? "";

  // ── Deep-link sync ────────────────────────────────────────────────────────

  const setActiveBranchId = useCallback(
    (id: string) => {
      setActiveBranchIdState(id);
      onDeepLinkChange("location", id || null);
    },
    [onDeepLinkChange],
  );

  const navigateMonth = useCallback(
    (delta: number) => {
      let m = viewMonth + delta;
      let y = viewYear;
      if (m > 12) { m = 1; y++; }
      if (m < 1) { m = 12; y--; }
      setViewYear(y);
      setViewMonth(m);
      setSelected(new Set());
      lastClickedRef.current = null;
      onDeepLinkChange("month", formatMonth(y, m));
    },
    [viewMonth, viewYear, onDeepLinkChange],
  );

  // ── Load working days for visible month ───────────────────────────────────

  const loadMonth = useCallback(() => {
    if (!specialistId) return;
    const dateFrom = monthStart(viewYear, viewMonth);
    const dateTo = monthEnd(viewYear, viewMonth);
    startTransition(async () => {
      const qs = new URLSearchParams({ dateFrom, dateTo, specialistId });
      try {
        const json = await apiJson<{ ok: boolean; rows: WorkingDayRecord[] }>(`${WD_BASE}?${qs.toString()}`);
        setDayRecords(json.rows);
        setLoadError(null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "load_failed");
      }
    });
  }, [specialistId, viewYear, viewMonth]);

  const loadTemplates = useCallback(() => {
    startTransition(async () => {
      try {
        const json = await apiJson<{ ok: boolean; rows: ScheduleTemplateRecord[] }>(TPL_BASE);
        setTemplates(json.rows);
      } catch {
        // non-fatal; templates panel just stays empty
      }
    });
  }, []);

  // ── Bootstrap (specialist + overview) ────────────────────────────────────

  useEffect(() => {
    startTransition(async () => {
      try {
        const overview = await fetchSoloOverview();
        if (!overview) { setLoadError("booking_engine_unavailable"); return; }
        const activeBranches = overview.branches.filter((b) => b.isActive);
        setBranches(activeBranches);
        const specId = await ensureDefaultSpecialist(overview.organization?.title);
        setSpecialistId(specId);
        // Default branch: from deep-link, or first active
        const savedId = deepLinkParams.location ?? "";
        const resolvedBranch =
          activeBranches.find((b) => b.id === savedId) ?? activeBranches[0];
        if (resolvedBranch) {
          setActiveBranchIdState(resolvedBranch.id);
          setPanelBranchId(resolvedBranch.id);
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "load_failed");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (specialistId) { loadMonth(); loadTemplates(); } }, [specialistId, loadMonth, loadTemplates]);

  // Refresh on re-activation
  useEffect(() => {
    if (!isActive || !specialistId) return;
    loadMonth();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ── Day selection ─────────────────────────────────────────────────────────

  const gridDates = buildMonthGrid(viewYear, viewMonth)
    .filter((d): d is string => d !== null);

  const toggleDay = useCallback(
    (date: string, shift: boolean, meta: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shift && lastClickedRef.current) {
          // Range selection
          const from = lastClickedRef.current;
          const [a, b] = from < date ? [from, date] : [date, from];
          for (const d of gridDates) {
            if (d >= a && d <= b) next.add(d);
          }
        } else if (meta) {
          // Toggle individual
          if (next.has(date)) { next.delete(date); }
          else { next.add(date); }
        } else {
          // Single click: toggle if only this; otherwise select only this
          if (next.size === 1 && next.has(date)) { next.clear(); }
          else { next.clear(); next.add(date); }
        }
        return next;
      });
      lastClickedRef.current = date;
    },
    [gridDates],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  function run(fn: () => Promise<void>, successMsg: string) {
    setActionError(null);
    setActionOk(null);
    startTransition(async () => {
      try {
        await fn();
        await loadMonth();
        loadTemplates();
        setActionOk(successMsg);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "action_failed");
      }
    });
  }

  function handleSave() {
    const dates = [...selected];
    if (!dates.length) return;
    let breakStartMinute: number | null = null;
    let breakEndMinute: number | null = null;
    if (panelBreakEnabled) {
      try {
        breakStartMinute = timeLabelToMinute(panelBreakStart);
        breakEndMinute = timeLabelToMinute(panelBreakEnd);
      } catch {
        setActionError("Неверный формат перерыва");
        return;
      }
    }
    let startMinute: number;
    let endMinute: number;
    try {
      startMinute = timeLabelToMinute(panelStart);
      endMinute = timeLabelToMinute(panelEnd);
    } catch {
      setActionError("Неверный формат времени");
      return;
    }
    run(async () => {
      await apiJson(WD_BASE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          dates,
          startMinute,
          endMinute,
          breakStartMinute: breakStartMinute ?? undefined,
          breakEndMinute: breakEndMinute ?? undefined,
          specialistId,
          branchId: panelBranchId || activeBranchId || undefined,
        }),
      });
      setSelected(new Set());
    }, `Сохранено для ${dates.length} дн.`);
  }

  function handleClose() {
    const dates = [...selected];
    if (!dates.length) return;
    run(async () => {
      await apiJson(WD_BASE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", dates, specialistId }),
      });
      setSelected(new Set());
    }, `${dates.length} дн. закрыто`);
  }

  function handleClear() {
    setSelected(new Set());
    lastClickedRef.current = null;
    setActionOk(null);
    setActionError(null);
  }

  function handleApplyTemplate(templateId: string) {
    const dates = [...selected];
    if (!dates.length) {
      setActionError("Выберите дни для применения шаблона");
      return;
    }
    run(async () => {
      await apiJson(`${TPL_BASE}?action=apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, dates, specialistId }),
      });
      setSelected(new Set());
    }, "Шаблон применён");
  }

  function handleDeleteTemplate(id: string) {
    run(async () => {
      await apiJson(`${TPL_BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    }, "Шаблон удалён");
  }

  function handleCreateTemplate() {
    let startMinute: number;
    let endMinute: number;
    let breakStartMinute: number | null = null;
    let breakEndMinute: number | null = null;
    try {
      startMinute = timeLabelToMinute(tplStart);
      endMinute = timeLabelToMinute(tplEnd);
      if (tplBreakEnabled) {
        breakStartMinute = timeLabelToMinute(tplBreakStart);
        breakEndMinute = timeLabelToMinute(tplBreakEnd);
      }
    } catch {
      setActionError("Неверный формат времени в шаблоне");
      return;
    }
    run(async () => {
      await apiJson(TPL_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tplName.trim() || `${minuteToTimeLabel(startMinute)}–${minuteToTimeLabel(endMinute)}`,
          startMinute,
          endMinute,
          breakStartMinute: breakStartMinute ?? undefined,
          breakEndMinute: breakEndMinute ?? undefined,
          branchId: activeBranchId || undefined,
        }),
      });
      setTplDialogOpen(false);
      setTplName("");
    }, "Шаблон создан");
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const dayMap = new Map(dayRecords.map((r) => [r.workDate, r]));
  const cells = buildMonthGrid(viewYear, viewMonth);
  const activeBranchLabel = branches.find((b) => b.id === activeBranchId)?.title;
  const panelBranchLabel = branches.find((b) => b.id === panelBranchId)?.title;
  const selectedCount = selected.size;
  const selectedDates = [...selected].sort();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={doctorSectionCardClass} data-testid="schedule-work-tab">
      {/* Toolbar: branch switcher + month nav */}
      <div className={`${DOCTOR_CATALOG_STICKY_BAR_CLASS} flex flex-wrap items-center gap-2`}>
        {/* Branch switcher */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Локация для назначения">
          {branches.map((b) => {
            const color = branchColorMap.get(b.id);
            const isActive = b.id === activeBranchId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => { setActiveBranchId(b.id); setPanelBranchId(b.id); }}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  isActive
                    ? color === "blue"
                      ? "bg-blue-500 border-blue-500 text-white"
                      : color === "green"
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-violet-600 border-violet-600 text-white"
                    : color === "blue"
                      ? "border-blue-500/50 text-blue-600 hover:bg-blue-50"
                      : color === "green"
                        ? "border-green-600/50 text-green-700 hover:bg-green-50"
                        : "border-violet-500/50 text-violet-700 hover:bg-violet-50",
                )}
                data-testid={`branch-btn-${b.id}`}
              >
                ● {b.title}
              </button>
            );
          })}
        </div>

        {/* Month nav */}
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => navigateMonth(-1)} aria-label="Предыдущий месяц" data-testid="month-prev">◀</Button>
          <span className="min-w-[120px] text-center text-sm font-semibold" data-testid="month-label">
            {RU_MONTHS[viewMonth]} {viewYear}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => navigateMonth(1)} aria-label="Следующий месяц" data-testid="month-next">▶</Button>
        </div>
      </div>

      {/* Errors / feedback */}
      {loadError ? <p className="text-sm text-destructive" data-testid="load-error">{loadError}</p> : null}
      {actionError ? <p className="text-sm text-destructive" data-testid="action-error">{actionError}</p> : null}
      {actionOk ? <p className="text-sm text-green-700 dark:text-green-400" data-testid="action-ok">{actionOk}</p> : null}

      {/* Month grid */}
      <div className={cn(doctorSectionCardClass, "p-0 overflow-hidden")} data-testid="month-grid">
        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 px-2 pb-1 pt-2 text-[10px] font-medium text-muted-foreground text-center">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1 p-2">
          {cells.map((dateKey, idx) => (
            <DayCell
              key={dateKey ?? `pad-${idx}`}
              dateKey={dateKey}
              today={today}
              record={dateKey ? dayMap.get(dateKey) : undefined}
              branchColorMap={branchColorMap}
              isSelected={dateKey ? selected.has(dateKey) : false}
              onToggle={toggleDay}
            />
          ))}
        </div>
      </div>

      {/* Bottom area: panel + templates */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Hours panel — visible when ≥1 day selected */}
        {selectedCount > 0 ? (
          <div
            className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex flex-col gap-3"
            data-testid="hours-panel"
          >
            <h3 className={cn(doctorSectionTitleClass, "text-primary")}>
              Задать расписание для {selectedCount} {selectedCount === 1 ? "дня" : selectedCount < 5 ? "дней" : "дней"} ({
                selectedDates.length <= 3
                  ? selectedDates.map((d) => {
                      const dt = DateTime.fromISO(d);
                      return `${dt.day} ${dt.setLocale("ru").toFormat("LLLL").slice(0, 3)}`;
                    }).join(", ")
                  : `${DateTime.fromISO(selectedDates[0]).day}–${DateTime.fromISO(selectedDates[selectedDates.length - 1]).day} …`
              })
            </h3>

            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="panel-start" className="text-xs">Начало</Label>
                <Input
                  id="panel-start"
                  type="time"
                  className="h-8 w-28"
                  value={panelStart}
                  onChange={(e) => setPanelStart(e.target.value)}
                  data-testid="panel-start"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="panel-end" className="text-xs">Конец</Label>
                <Input
                  id="panel-end"
                  type="time"
                  className="h-8 w-28"
                  value={panelEnd}
                  onChange={(e) => setPanelEnd(e.target.value)}
                  data-testid="panel-end"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Обед</Label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="panel-break-enabled"
                    checked={panelBreakEnabled}
                    onChange={(e) => setPanelBreakEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                    data-testid="panel-break-enabled"
                  />
                  {panelBreakEnabled && (
                    <>
                      <Input
                        type="time"
                        className="h-8 w-24"
                        value={panelBreakStart}
                        onChange={(e) => setPanelBreakStart(e.target.value)}
                        data-testid="panel-break-start"
                      />
                      <span className="text-xs text-muted-foreground">—</span>
                      <Input
                        type="time"
                        className="h-8 w-24"
                        value={panelBreakEnd}
                        onChange={(e) => setPanelBreakEnd(e.target.value)}
                        data-testid="panel-break-end"
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 min-w-[160px]">
                <Label className="text-xs">Локация</Label>
                <Select
                  value={panelBranchId}
                  onValueChange={(v) => v && setPanelBranchId(v)}
                >
                  <SelectTrigger className="h-8" displayLabel={panelBranchLabel} data-testid="panel-branch" />
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
                Сохранить
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={handleClose}
                data-testid="btn-close-days"
              >
                Закрыть выбранные дни
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleClear}
                data-testid="btn-clear-selection"
              >
                Очистить выбор
              </Button>
            </div>
          </div>
        ) : (
          <div className={cn(doctorSectionCardClass, "border-dashed")}>
            <p className={doctorEmptyStateClass.replace("text-sm", "text-xs")}>
              Выберите дни в сетке — появится панель настройки часов.
            </p>
          </div>
        )}

        {/* Templates panel */}
        <div className={doctorSectionCardClass} data-testid="templates-panel">
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
            <p className="text-xs text-muted-foreground">Нет шаблонов.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {templates.filter((t) => t.isActive).map((tpl) => (
                <li
                  key={tpl.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm"
                  data-testid={`template-${tpl.id}`}
                >
                  <span className="min-w-0 truncate text-sm">{tpl.name}</span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={pending || selectedCount === 0}
                      title={selectedCount === 0 ? "Выберите дни для применения" : undefined}
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
              ))}
            </ul>
          )}

          {selectedCount === 0 && templates.length > 0 && (
            <p className="text-[10px] text-muted-foreground">Выберите дни для применения шаблона.</p>
          )}
        </div>
      </div>

      {/* Create template dialog */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать шаблон расписания</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1">
              <Label htmlFor="tpl-name" className="text-xs">Название</Label>
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
                <Label htmlFor="tpl-start" className="text-xs">Начало</Label>
                <Input
                  id="tpl-start"
                  type="time"
                  className="h-8 w-28"
                  value={tplStart}
                  onChange={(e) => setTplStart(e.target.value)}
                  data-testid="tpl-start"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="tpl-end" className="text-xs">Конец</Label>
                <Input
                  id="tpl-end"
                  type="time"
                  className="h-8 w-28"
                  value={tplEnd}
                  onChange={(e) => setTplEnd(e.target.value)}
                  data-testid="tpl-end"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tpl-break-enabled"
                checked={tplBreakEnabled}
                onChange={(e) => setTplBreakEnabled(e.target.checked)}
                className="h-4 w-4"
                data-testid="tpl-break-enabled"
              />
              <Label htmlFor="tpl-break-enabled" className="text-xs">Обед</Label>
              {tplBreakEnabled && (
                <>
                  <Input type="time" className="h-8 w-24" value={tplBreakStart} onChange={(e) => setTplBreakStart(e.target.value)} data-testid="tpl-break-start" />
                  <span className="text-xs">—</span>
                  <Input type="time" className="h-8 w-24" value={tplBreakEnd} onChange={(e) => setTplBreakEnd(e.target.value)} data-testid="tpl-break-end" />
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setTplDialogOpen(false)}>
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
    </div>
  );
}
