"use client";

/**
 * PatientTabKarta — clinical core («Карта»). Faithful to the wireframe
 * (docs/design/doctor-cabinet-wireframe.html #pp-karta + #visit-panel).
 *
 * Left column: Жалобы · Актуальный диагноз · Сопутствующие заболевания · Анамнез.
 * Right column: История визитов feed (collapsible cards) + «+ Новый визит».
 * «+ Новый визит» opens the NewVisitPanel form.
 *
 * State matrix (panelOpen = add-visit form open; historyVisible = history shown):
 *
 * DEFAULT (!panelOpen):
 *   grid lg:grid-cols-[1.1fr_1fr] — full width, two balanced columns.
 *   LEFT = clinical card, no blur.
 *   RIGHT = header row [◀/▶ toggle | «История визитов» count] [«+ Новый визит»],
 *           then history feed (when visible) or hint (when hidden).
 *
 * ADD + history HIDDEN:
 *   grid lg:grid-cols-[1fr_1.3fr] — form column wider.
 *   LEFT = clinical card shown CLEARLY (no blur).
 *   RIGHT = NewVisitPanel (wide, comfortable).
 *   Toggle ▶ near history heading area to bring history back.
 *
 * ADD + history VISIBLE:
 *   grid lg:grid-cols-[0.75fr_1.25fr] — right region dominant.
 *   LEFT = clinical card BLURRED (opacity-50 blur-[1.5px]).
 *   RIGHT stacks vertically:
 *     - NewVisitPanel (full right-region width) ON TOP
 *     - «История визитов» heading (with ◀ toggle on its LEFT) + feed BELOW.
 *
 * Toggle (◀/▶) always sits LEFT of the «История визитов» heading.
 * «+ Новый визит» button always on the RIGHT of the header row.
 *
 * Data:
 *   - Clinical state (жалобы/диагнозы/визиты): GET .../clinical (real).
 *   - Анамнез: GET .../anamnesis (real). POST .../anamnesis to append entries.
 *   - Сопутствующие заболевания: MOCK (deferred).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import { DoctorDatePicker } from "@/shared/ui/doctor/DoctorDatePicker";
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  AnamnesisIllnessEntry,
  AnamnesisLifestyleEntry,
  AnamnesisState,
  AnamnesisTraumaEntry,
  ClinicalState,
  DiagnosisClinicalStatus,
  DiagnosisStatusHistoryEntry,
  Visit,
} from "@/modules/patient-clinical/ports";
import { cn } from "@/lib/utils";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import { NewVisitPanel } from "./karta/NewVisitPanel";

type Props = {
  userId: string;
  header?: PatientCardHeader;
  /** When set, auto-open the new-visit panel (linked to this appointment). */
  pendingAppointmentId?: string | null;
  /** When set, pre-fill the new-visit date (ISO YYYY-MM-DD) from the appointment. */
  pendingVisitDate?: string | null;
  onPendingConsumed?: () => void;
  initialClinicalState?: ClinicalState | null;
  initialVisits?: Visit[] | null;
  /** SSR-provided anamnesis — skips the initial client fetch when present. */
  initialAnamnesis?: AnamnesisState | null;
  /** SSR-provided active comorbidities — skips the Comorbidities component's initial fetch. */
  initialComorbidities?: Comorbidity[] | null;
};

// ---------------------------------------------------------------------------
// Styles (unchanged from original)
// ---------------------------------------------------------------------------

const severityBadgeClass =
  "flex-none self-center rounded-md bg-primary/15 px-1.5 py-px text-xs font-bold text-primary";
const editIconClass =
  "flex-none cursor-pointer self-center text-sm text-muted-foreground hover:text-foreground";
const dateMetaClass = "flex-none self-center text-xs text-muted-foreground";
const sectionLabelClass = "text-xs font-semibold text-foreground";
const plusBtnClass =
  "grid h-[18px] w-[18px] place-items-center rounded-md border border-primary/40 text-xs text-primary hover:bg-primary/10";
const miniTabRowClass = "flex gap-1";

// ---------------------------------------------------------------------------
// Small UI atoms (unchanged from original)
// ---------------------------------------------------------------------------

function MiniTab({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "cursor-pointer rounded-md px-1.5 py-0.5 text-xs",
        active ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 44;
  const h = 14;
  const max = 10;
  const stepX = (w - 6) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = 3 + i * stepX;
    const y = 3 + (1 - p / max) * (h - 6);
    return { x, y };
  });
  const poly = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg width={w} height={h} className="flex-none self-center" aria-hidden="true">
      <polyline points={poly} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary" />
      <circle cx={last.x} cy={last.y} r={2} className="fill-primary" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Row components — wired to backend types
// ---------------------------------------------------------------------------

/**
 * ComplaintRow maps ActiveComplaint → UI row.
 * Field mapping:
 *   ActiveComplaint.currentSeverity → severity badge (N/10)
 *   ActiveComplaint.trend           → sparkline
 *   ActiveComplaint.since           → date meta
 *   ActiveComplaint.priority        → flag
 *   ActiveComplaint.text            → label
 */
function ComplaintRow({
  c,
  userId,
  onSaved,
}: {
  c: ActiveComplaint;
  userId: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.text);
  const [priority, setPriority] = useState(c.priority);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const open = () => {
    setText(c.text);
    setPriority(c.priority);
    setError(false);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/complaints/${c.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, priority }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setEditing(false);
      onSaved();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <InlineFieldEditor
        priority={priority}
        onTogglePriority={() => setPriority((p) => !p)}
        value={text}
        onChange={setText}
        onSave={save}
        onCancel={() => setEditing(false)}
        saving={saving}
        error={error}
        placeholder="Текст жалобы"
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 text-sm">
      {c.priority ? (
        <span className="flex-none self-center text-primary" title="Приоритет">
          ⚑
        </span>
      ) : (
        <span className="w-3 flex-none" />
      )}
      <span className="flex-1">{c.text}</span>
      <span className={severityBadgeClass}>{c.currentSeverity}/10</span>
      <Sparkline points={c.trend} />
      <button type="button" className={editIconClass} title="Редактировать" onClick={open}>
        ✎
      </button>
      <span className={dateMetaClass}>{c.since}</span>
    </div>
  );
}

/**
 * Общий инлайн-редактор «текст + приоритет» для жалоб и диагнозов.
 * Enter — сохранить, Esc — отмена.
 */
function InlineFieldEditor({
  priority,
  onTogglePriority,
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  placeholder,
}: {
  priority: boolean;
  onTogglePriority: () => void;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-primary/40 bg-background px-2.5 py-2 text-sm">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title={priority ? "Снять приоритет" : "Сделать приоритетным"}
          onClick={onTogglePriority}
          className={cn(
            "flex-none self-center text-base",
            priority ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground",
          )}
        >
          ⚑
        </button>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex-none rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "…" : "Сохранить"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-none rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
      {error && <span className="text-xs text-destructive">Не удалось сохранить. Текст обязателен.</span>}
    </div>
  );
}

// -- Клинический статус диагноза: badge + actions ----------------------------

const CLINICAL_STATUS_BADGE: Record<
  DiagnosisClinicalStatus,
  { label: string; className: string }
> = {
  предварительный: {
    label: "предв.",
    className:
      "rounded px-1.5 py-px text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  подтверждённый: {
    label: "подтв.",
    className:
      "rounded px-1.5 py-px text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  закрытый: {
    label: "закрыт",
    className:
      "rounded px-1.5 py-px text-[10px] font-semibold bg-muted text-muted-foreground",
  },
};

function DiagnosisStatusHistoryList({ entries }: { entries: DiagnosisStatusHistoryEntry[] }) {
  if (entries.length === 0)
    return (
      <p className="py-1 text-[11px] text-muted-foreground">История изменений пуста.</p>
    );
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map((e) => (
        <li key={e.id} className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{e.newStatus}</span>
          {e.oldStatus ? ` (из: ${e.oldStatus})` : " (начальный)"}
          {" · "}
          {new Date(e.changedAt).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          {e.note ? ` — ${e.note}` : ""}
        </li>
      ))}
    </ul>
  );
}

/**
 * DiagnosisRow maps ActiveDiagnosis → UI row.
 * Field mapping:
 *   ActiveDiagnosis.status → tone: "active"|"refined" → calm styling for "refined"
 *   ActiveDiagnosis.clinicalStatus → status badge + action buttons
 *   ActiveDiagnosis.meta   → date meta string
 *   ActiveDiagnosis.priority → flag
 *   ActiveDiagnosis.text    → label
 */
function DiagnosisRow({
  d,
  userId,
  onSaved,
}: {
  d: ActiveDiagnosis;
  userId: string;
  onSaved: () => void;
}) {
  // "refined" status gets the muted/calm visual style; "active" gets the highlighted style
  const isCalm = d.status === "refined";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.text);
  const [priority, setPriority] = useState(d.priority);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Clinical status state
  const [clinicalStatus, setClinicalStatus] = useState<DiagnosisClinicalStatus>(
    d.clinicalStatus,
  );
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<DiagnosisStatusHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const open = () => {
    setText(d.text);
    setPriority(d.priority);
    setError(false);
    setEditing(true);
  };

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/diagnoses/${d.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, priority }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setEditing(false);
      onSaved();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (newStatus: DiagnosisClinicalStatus) => {
    if (newStatus === clinicalStatus) return;
    setStatusSaving(true);
    setStatusError(false);
    try {
      const res = await fetch(
        `/api/doctor/patients/${userId}/diagnoses/${d.id}/status`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      setClinicalStatus(newStatus);
      // Refresh history if it's open
      if (showHistory) {
        setHistory(null);
        void loadHistory();
      }
    } catch {
      setStatusError(true);
    } finally {
      setStatusSaving(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/doctor/patients/${userId}/diagnoses/${d.id}/status`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { history?: DiagnosisStatusHistoryEntry[] };
      setHistory(data.history ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    if (!showHistory && history === null) {
      void loadHistory();
    }
    setShowHistory((v) => !v);
  };

  if (editing) {
    return (
      <InlineFieldEditor
        priority={priority}
        onTogglePriority={() => setPriority((p) => !p)}
        value={text}
        onChange={setText}
        onSave={save}
        onCancel={() => setEditing(false)}
        saving={saving}
        error={error}
        placeholder="Текст диагноза"
      />
    );
  }

  const badge = CLINICAL_STATUS_BADGE[clinicalStatus];

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-sm",
        isCalm ? "border-border bg-muted/15" : "border-border/70 bg-background/40",
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-1.5">
        {d.priority ? (
          <span className="flex-none self-center text-primary" title="Приоритет">
            ⚑
          </span>
        ) : (
          <span className="w-3 flex-none" />
        )}
        <span className="flex-1">{d.text}</span>
        {/* Clinical status badge */}
        <span className={cn("flex-none", badge.className)} title={`Клинический статус: ${clinicalStatus}`}>
          {badge.label}
        </span>
        <button type="button" className={editIconClass} title="Редактировать" onClick={open}>
          ✎
        </button>
        <span className={dateMetaClass}>{d.meta}</span>
      </div>

      {/* Status action buttons */}
      <div className="flex items-center gap-1.5 pl-4">
        {clinicalStatus !== "подтверждённый" && (
          <button
            type="button"
            disabled={statusSaving}
            onClick={() => changeStatus("подтверждённый")}
            className="rounded border border-emerald-400/60 px-1.5 py-px text-[10px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700/50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            Подтвердить
          </button>
        )}
        {clinicalStatus !== "закрытый" && (
          <button
            type="button"
            disabled={statusSaving}
            onClick={() => changeStatus("закрытый")}
            className="rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground hover:bg-muted/30 disabled:opacity-50"
          >
            Закрыть
          </button>
        )}
        {clinicalStatus === "закрытый" && (
          <button
            type="button"
            disabled={statusSaving}
            onClick={() => changeStatus("предварительный")}
            className="rounded border border-amber-400/60 px-1.5 py-px text-[10px] text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700/50 dark:text-amber-400"
          >
            Переоткрыть
          </button>
        )}
        <button
          type="button"
          onClick={toggleHistory}
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showHistory ? "скрыть историю ▴" : "история ▾"}
        </button>
        {statusSaving && (
          <span className="text-[10px] text-muted-foreground">сохранение…</span>
        )}
        {statusError && (
          <span className="text-[10px] text-destructive">Ошибка — попробуйте снова</span>
        )}
      </div>

      {/* Status history (inline, collapsible) */}
      {showHistory && (
        <div className="ml-4 rounded bg-muted/20 px-2.5 py-1.5">
          {historyLoading && (
            <p className="animate-pulse text-[11px] text-muted-foreground">Загрузка…</p>
          )}
          {!historyLoading && history !== null && (
            <DiagnosisStatusHistoryList entries={history} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Сопутствующие заболевания (реальный бэкенд patient-comorbidities)
// ---------------------------------------------------------------------------

type Comorbidity = {
  id: string;
  text: string;
  since: string | null;
  status: "active" | "removed";
  createdAt: string;
};

function Comorbidities({
  userId,
  initialItems,
}: {
  userId: string;
  /** SSR-provided active comorbidities. When present, skips the initial "active" tab fetch. */
  initialItems?: Comorbidity[];
}) {
  const [tab, setTab] = useState<"active" | "removed">("active");
  const [items, setItems] = useState<Comorbidity[] | null>(() => initialItems ?? null);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [since, setSince] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSince, setEditSince] = useState("");

  const base = `/api/doctor/patients/${userId}/comorbidities`;

  const load = useCallback(() => {
    setItems(null);
    fetch(`${base}?status=${tab}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ comorbidities: Comorbidity[] }>) : null))
      .then((d) => {
        if (!d) {
          setError(true);
          setItems([]);
          return;
        }
        setError(false);
        setItems(d.comorbidities ?? []);
      })
      .catch(() => {
        setError(true);
        setItems([]);
      });
  }, [base, tab]);

  useEffect(() => {
    // Skip the initial "active" fetch when SSR data provided.
    // On tab switch to "removed", always fetch (SSR only covers active).
    if (tab === "active" && initialItems != null && items !== null) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, since: since.trim() || null }),
      });
      if (res.ok) {
        setText("");
        setSince("");
        setAdding(false);
        if (tab === "active") load();
      }
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (id: string) => {
    const t = editText.trim();
    if (!t) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, since: editSince.trim() || null }),
      });
      if (res.ok) {
        setEditingId(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const markRemoved = async (id: string) => {
    setItems((list) => (list ? list.filter((c) => c.id !== id) : list));
    await fetch(`${base}/${id}`, { method: "DELETE", credentials: "include" }).catch(() => {});
  };

  const restore = async (id: string) => {
    setItems((list) => (list ? list.filter((c) => c.id !== id) : list));
    await fetch(`${base}/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    }).catch(() => {});
  };

  return (
    <section className={doctorSectionCardClass}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <h3 className={doctorSectionTitleClass}>Сопутствующие заболевания</h3>
          {tab === "active" && !adding && (
            <button
              type="button"
              className={plusBtnClass}
              title="Добавить"
              onClick={() => setAdding(true)}
            >
              +
            </button>
          )}
        </span>
        <span className={miniTabRowClass}>
          <button type="button" onClick={() => setTab("active")}>
            <MiniTab active={tab === "active"}>Текущие</MiniTab>
          </button>
          <button type="button" onClick={() => setTab("removed")}>
            <MiniTab active={tab === "removed"}>Снятые</MiniTab>
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {adding && tab === "active" && (
          <div className="flex flex-col gap-1 rounded-lg border border-primary/40 bg-background px-2.5 py-2">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                } else if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Заболевание"
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center gap-1.5">
              <input
                value={since}
                onChange={(e) => setSince(e.target.value)}
                placeholder="с какого времени (необяз.)"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={add}
                disabled={saving}
                className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "…" : "Добавить"}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                disabled={saving}
                className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {items === null && (
          <p className="animate-pulse py-2 text-xs text-muted-foreground">Загрузка…</p>
        )}
        {items !== null && error && (
          <p className="py-1 text-xs text-destructive">Не удалось загрузить.</p>
        )}
        {items !== null && !error && items.length === 0 && !adding && (
          <p className="py-2 text-xs text-muted-foreground">
            {tab === "active" ? "Сопутствующих заболеваний нет." : "Снятых записей нет."}
          </p>
        )}

        {items?.map((co) =>
          editingId === co.id ? (
            <div
              key={co.id}
              className="flex flex-col gap-1 rounded-lg border border-primary/40 bg-background px-2.5 py-2"
            >
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit(co.id);
                  } else if (e.key === "Escape") setEditingId(null);
                }}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              />
              <div className="flex items-center gap-1.5">
                <input
                  value={editSince}
                  onChange={(e) => setEditSince(e.target.value)}
                  placeholder="с какого времени (необяз.)"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => saveEdit(co.id)}
                  disabled={saving}
                  className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? "…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  disabled={saving}
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div
              key={co.id}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm",
                tab === "active"
                  ? "border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20"
                  : "border-border bg-muted/15 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex-none self-center",
                  tab === "active" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
                )}
              >
                ●
              </span>
              <span className="flex-1">{co.text}</span>
              {tab === "active" && (
                <>
                  <button
                    type="button"
                    className={editIconClass}
                    title="Редактировать"
                    onClick={() => {
                      setEditingId(co.id);
                      setEditText(co.text);
                      setEditSince(co.since ?? "");
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={editIconClass}
                    title="Снять (в историю)"
                    onClick={() => markRemoved(co.id)}
                  >
                    ×
                  </button>
                </>
              )}
              {tab === "removed" && (
                <button
                  type="button"
                  className="flex-none cursor-pointer self-center text-xs text-primary hover:underline"
                  title="Восстановить"
                  onClick={() => restore(co.id)}
                >
                  восстановить
                </button>
              )}
              {co.since && <span className={dateMetaClass}>{co.since}</span>}
            </div>
          ),
        )}
      </div>
    </section>
  );
}

/**
 * Текстовые поля визита, доступные для правки, в порядке отображения.
 * `title` совпадает с заголовком секции из проекции listVisits (для маппинга обратно).
 */
const VISIT_SECTION_FIELDS = [
  { key: "exam", title: "Осмотр" },
  { key: "manipulations", title: "Проведённые манипуляции" },
  { key: "trialResults", title: "Результаты проб" },
  { key: "recommendations", title: "Рекомендации / Назначения" },
] as const;

type VisitSectionFieldKey = (typeof VISIT_SECTION_FIELDS)[number]["key"];

function VisitCard({
  visit,
  defaultExpanded,
  userId,
  onSaved,
}: {
  visit: Visit;
  defaultExpanded?: boolean;
  userId: string;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Initialize edit fields from the projection (sections by title + header location/duration).
  const initialFields = useCallback((): Record<VisitSectionFieldKey, string> => {
    const byTitle = new Map((visit.sections ?? []).map((s) => [s.title, s.body]));
    return {
      exam: byTitle.get("Осмотр") ?? "",
      manipulations: byTitle.get("Проведённые манипуляции") ?? "",
      trialResults: byTitle.get("Результаты проб") ?? "",
      recommendations: byTitle.get("Рекомендации / Назначения") ?? "",
    };
  }, [visit.sections]);

  const [fields, setFields] = useState<Record<VisitSectionFieldKey, string>>(initialFields);
  const [location, setLocation] = useState(visit.location ?? "");

  const openEdit = () => {
    setFields(initialFields());
    setLocation(visit.location ?? "");
    setError(false);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/visits/${visit.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, location }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setEditing(false);
      onSaved();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        <b className="text-sm text-foreground">{visit.date}</b>
        <span
          className={cn(
            "rounded-md px-1.5 py-px text-xs font-medium",
            visit.type === "first"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {visit.type === "first" ? "Первичный" : "Повторный"}
        </span>
        <span className={doctorSectionSubtitleClass}>
          {visit.location} · {visit.duration}
          {visit.filesCount ? ` · 📎 ${visit.filesCount}` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {expanded ? "свернуть ▴" : "развернуть ▾"}
        </span>
      </button>
      {expanded ? (
        <div className="flex flex-col gap-2.5 border-t border-border px-3 py-2.5">
          {visit.dynamics && visit.dynamics.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-foreground">Динамика симптомов</div>
              <div className="flex flex-col gap-1.5">
                {visit.dynamics.map((dyn) => (
                  <div key={dyn.id} className="rounded-md border border-border/70 bg-muted/15 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {dyn.priority ? <span className="text-primary">⚑</span> : null}
                      {dyn.label}
                      <span className="ml-auto font-bold text-primary">
                        {dyn.from}/10 → {dyn.to}/10
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm text-foreground">{dyn.note}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {editing ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-foreground">Локация</span>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Например: Кабинет 3"
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                />
              </label>
              {VISIT_SECTION_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-foreground">{f.title}</span>
                  <textarea
                    value={fields[f.key]}
                    onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    rows={2}
                    className="resize-y rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                  />
                </label>
              ))}
              {error && <span className="text-xs text-destructive">Не удалось сохранить.</span>}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              {visit.sections?.map((s) => (
                <div key={s.title} className="flex flex-col gap-0.5">
                  <div className="text-xs font-semibold text-foreground">{s.title}</div>
                  <div className="text-sm text-foreground">{s.body}</div>
                </div>
              ))}
              {visit.files && visit.files.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {visit.files.map((f) => (
                    <span
                      key={f.id}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                    >
                      <span>{f.icon}</span>
                      <span>{f.name}</span>
                    </span>
                  ))}
                  <span className={doctorSectionSubtitleClass}>— файлы, прикреплённые к визиту</span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={openEdit}
                className="self-start text-xs text-muted-foreground hover:text-primary"
              >
                ✎ править записи визита
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Toggle button for history expand/collapse — always sits LEFT of the heading */
function HistoryToggleBtn({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={visible ? "Скрыть историю — увидеть карту" : "Показать историю визитов"}
      className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {visible ? "◀" : "▶"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface ClinicalApiResponse {
  ok: boolean;
  state: {
    complaints: ActiveComplaint[];
    diagnoses: ActiveDiagnosis[];
  };
  visits: Visit[];
}

interface AnamnesisApiResponse {
  ok: boolean;
  anamnesis: AnamnesisState;
}

// ---------------------------------------------------------------------------
// Anamnesis add-entry sub-forms
// ---------------------------------------------------------------------------

function AddTraumaForm({
  userId,
  onAdded,
  onCancel,
}: {
  userId: string;
  onAdded: (entry: AnamnesisTraumaEntry) => void;
  onCancel: () => void;
}) {
  const [year, setYear] = useState("");
  const [what, setWhat] = useState("");
  const [type, setType] = useState("Травма");
  const [immob, setImmob] = useState("—");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  useEffect(() => { yearRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!year.trim() || !what.trim()) { setErr("Заполните Год и Что"); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/anamnesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "trauma", year: year.trim(), what: what.trim(), type: type.trim() || "Травма", immobilization: immob.trim() || "—" }),
      });
      const data = (await res.json()) as { ok?: boolean; entry?: AnamnesisTraumaEntry };
      if (!res.ok || !data.ok || !data.entry) throw new Error("save_failed");
      onAdded(data.entry);
    } catch {
      setErr("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary/50";
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground">Год</label>
          <input ref={yearRef} value={year} onChange={e => setYear(e.target.value)} placeholder="Год" className={inputClass} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground">Тип</label>
          <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
            <option value="Травма">Травма</option>
            <option value="Операция">Операция</option>
            <option value="Перелом">Перелом</option>
            <option value="Растяжение">Растяжение</option>
            <option value="Разрыв">Разрыв</option>
            <option value="Вывих">Вывих</option>
            <option value="Контузия">Контузия</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground">Что произошло</label>
        <input value={what} onChange={e => setWhat(e.target.value)} placeholder="Опишите травму или операцию…" className={inputClass} />
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground">Иммобилизация / восстановление</label>
        <input value={immob} onChange={e => setImmob(e.target.value)} placeholder="Длительность, режим восстановления…" className={inputClass} />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={saving} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60">
          {saving ? "Сохранение…" : "Добавить"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          Отмена
        </button>
      </div>
    </form>
  );
}

function AddIllnessForm({
  userId,
  onAdded,
  onCancel,
}: {
  userId: string;
  onAdded: (entry: AnamnesisIllnessEntry) => void;
  onCancel: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [what, setWhat] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const periodRef = useRef<HTMLInputElement>(null);

  useEffect(() => { periodRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!period.trim() || !what.trim()) { setErr("Заполните Период и Что"); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/anamnesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "illness", period: period.trim(), what: what.trim(), comment: comment.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; entry?: AnamnesisIllnessEntry };
      if (!res.ok || !data.ok || !data.entry) throw new Error("save_failed");
      onAdded(data.entry);
    } catch {
      setErr("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary/50";
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground">Период</label>
          <input ref={periodRef} value={period} onChange={e => setPeriod(e.target.value)} placeholder="Год или период" className={inputClass} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground">Что</label>
          <input value={what} onChange={e => setWhat(e.target.value)} placeholder="Что произошло, длительность…" className={inputClass} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground">Комментарий</label>
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Описание, последствия, примечание…" className={inputClass} />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={saving} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60">
          {saving ? "Сохранение…" : "Добавить"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          Отмена
        </button>
      </div>
    </form>
  );
}

function AddLifestyleForm({
  userId,
  onAdded,
  onCancel,
}: {
  userId: string;
  onAdded: (entry: AnamnesisLifestyleEntry) => void;
  onCancel: () => void;
}) {
  // Default date = today in YYYY-MM-DD
  const todayIso = new Date().toISOString().slice(0, 10);
  const [recordDate, setRecordDate] = useState(todayIso);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setErr("Введите текст записи"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) { setErr("Неверный формат даты"); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/anamnesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "lifestyle", recordDate, text: text.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; entry?: AnamnesisLifestyleEntry };
      if (!res.ok || !data.ok || !data.entry) throw new Error("save_failed");
      onAdded(data.entry);
    } catch {
      setErr("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary/50";
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground">Дата записи</label>
        <DoctorDatePicker value={recordDate} onChange={setRecordDate} />
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-muted-foreground">Образ жизни / привычки</label>
        <textarea
          ref={textRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Работа сидячая, 8–10 часов. В выходные прогулки…"
          className="min-h-[60px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-1.5">
        <button type="submit" disabled={saving} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60">
          {saving ? "Сохранение…" : "Добавить"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          Отмена
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const EMPTY_ANAMNESIS: AnamnesisState = { trauma: [], illness: [], lifestyle: [] };

export function PatientTabKarta({ userId, header: _header, pendingAppointmentId, pendingVisitDate, onPendingConsumed, initialClinicalState, initialVisits, initialAnamnesis, initialComorbidities }: Props) {
  const hasSsrClinical = initialClinicalState != null && initialVisits != null;
  const [panelOpen, setPanelOpen] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(true);

  // Clinical data — loaded from /api/doctor/patients/[userId]/clinical
  const [complaints, setComplaints] = useState<ActiveComplaint[]>(() => hasSsrClinical ? initialClinicalState!.complaints : []);
  const [diagnoses, setDiagnoses] = useState<ActiveDiagnosis[]>(() => hasSsrClinical ? initialClinicalState!.diagnoses : []);
  const [visits, setVisits] = useState<Visit[]>(() => hasSsrClinical ? initialVisits! : []);
  const [isLoading, setIsLoading] = useState(!hasSsrClinical);
  const [fetchError, setFetchError] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() => hasSsrClinical ? userId : null);

  // Anamnesis data — loaded from /api/doctor/patients/[userId]/anamnesis
  const hasSsrAnamnesis = initialAnamnesis != null;
  const [anamnesis, setAnamnesis] = useState<AnamnesisState>(() => initialAnamnesis ?? EMPTY_ANAMNESIS);
  const [anamnesisLoadedUserId, setAnamnesisLoadedUserId] = useState<string | null>(() => hasSsrAnamnesis ? userId : null);
  const [anamnesisError, setAnamnesisError] = useState(false);
  // Which add-form is open: null | "trauma" | "illness" | "lifestyle"
  const [anamnesisAddOpen, setAnamnesisAddOpen] = useState<"trauma" | "illness" | "lifestyle" | null>(null);

  // fetchClinical is stable per userId — used on mount + after save
  const fetchClinical = useCallback(() => {
    fetch(`/api/doctor/patients/${userId}/clinical`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<ClinicalApiResponse>;
      })
      .then((data) => {
        setComplaints(data.state.complaints);
        setDiagnoses(data.state.diagnoses);
        setVisits(data.visits);
        setFetchError(false);
        setLoadedUserId(userId);
        setIsLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoadedUserId(userId);
        setIsLoading(false);
      });
  }, [userId]);

  const fetchAnamnesis = useCallback(() => {
    fetch(`/api/doctor/patients/${userId}/anamnesis`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<AnamnesisApiResponse>;
      })
      .then((data) => {
        setAnamnesis(data.anamnesis ?? EMPTY_ANAMNESIS);
        setAnamnesisError(false);
        setAnamnesisLoadedUserId(userId);
      })
      .catch(() => {
        setAnamnesisError(true);
        setAnamnesisLoadedUserId(userId);
      });
  }, [userId]);

  useEffect(() => {
    // Skip clinical fetch on mount when SSR data covers this userId.
    // fetchClinical() remains callable after mutations (onSaved callbacks).
    if (hasSsrClinical && loadedUserId === userId) {
      // Skip anamnesis fetch too when SSR data provided.
      if (!hasSsrAnamnesis) fetchAnamnesis();
      return;
    }
    fetchClinical();
    if (!hasSsrAnamnesis) fetchAnamnesis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchClinical, fetchAnamnesis]);

  // Auto-open new visit panel when navigated via URL param or in-page tab switch from Визиты
  useEffect(() => {
    if (pendingAppointmentId) {
      setPanelOpen(true);
      onPendingConsumed?.();
    }
  }, [pendingAppointmentId, onPendingConsumed]);

  // Treat as loading while userId doesn't match loaded data
  const isStale = loadedUserId !== userId;
  const loading = isStale || isLoading;
  // Anamnesis loading derived (mirrors clinical) — avoids synchronous setState in effect
  const anamnesisLoading = anamnesisLoadedUserId !== userId;

  /**
   * Grid column ratios per state matrix:
   *   DEFAULT:             1.1fr / 1fr   — balanced, card slightly wider
   *   ADD + history HIDDEN: 1fr / 1.3fr  — form column wider, card clear
   *   ADD + history VISIBLE: 0.75fr / 1.25fr — right dominant, card blurred
   */
  const gridCols = !panelOpen
    ? "lg:grid-cols-[1.1fr_1fr]"
    : historyVisible
      ? "lg:grid-cols-[0.75fr_1.25fr]"
      : "lg:grid-cols-[1fr_1.3fr]";

  /**
   * Blur the LEFT clinical card ONLY when panel is open, history is visible, AND there are
   * actual visits — don't blur when opening a new form on an empty history (VIZ-05).
   */
  const leftBlur = panelOpen && historyVisible && visits.length > 0;

  // Callback for NewVisitPanel after successful save — refetch + close panel + show history
  const handleVisitSaved = useCallback(() => {
    setPanelOpen(false);
    setHistoryVisible(true);
    fetchClinical();
  }, [fetchClinical]);

  return (
    <div className={cn("grid items-start gap-2.5", gridCols)}>
      {/* ── LEFT: clinical state (Карта) ─────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col gap-2.5 transition-all duration-200",
          leftBlur && "opacity-50 blur-[1.5px]",
        )}
      >
        {/* Жалобы */}
        <section className={doctorSectionCardClass}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <h3 className={doctorSectionTitleClass}>Жалобы</h3>
            </span>
            <span className={miniTabRowClass}>
              <MiniTab active>Актуальные</MiniTab>
              <MiniTab>История</MiniTab>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {loading && (
              <p className="animate-pulse py-2 text-xs text-muted-foreground">Загрузка…</p>
            )}
            {!loading && fetchError && (
              <p className="py-1 text-xs text-destructive">Не удалось загрузить жалобы.</p>
            )}
            {!loading && !fetchError && complaints.length === 0 && (
              <p className="py-2 text-xs text-muted-foreground">Жалоб пока нет.</p>
            )}
            {!loading && complaints.map((c) => (
              <ComplaintRow key={c.id} c={c} userId={userId} onSaved={fetchClinical} />
            ))}
          </div>
          <p className={doctorSectionSubtitleClass}>
            ⚑ — приоритет · N/10 — выраженность (обновляется каждым визитом, по значениям строится
            график динамики) · ✎ — правка: снять / в историю
          </p>
        </section>

        {/* Актуальный диагноз — read-only; diagnoses are added via visits (KARTA-02) */}
        <section className={doctorSectionCardClass}>
          <div className="flex items-center justify-between">
            <h3 className={doctorSectionTitleClass}>Актуальный диагноз</h3>
            <span className={miniTabRowClass}>
              <MiniTab active>Текущий</MiniTab>
              <MiniTab>История</MiniTab>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {loading && (
              <p className="animate-pulse py-2 text-xs text-muted-foreground">Загрузка…</p>
            )}
            {!loading && fetchError && (
              <p className="py-1 text-xs text-destructive">Не удалось загрузить диагнозы.</p>
            )}
            {!loading && !fetchError && diagnoses.filter((d) => d.clinicalStatus === "подтверждённый").length === 0 && (
              <p className="py-2 text-xs text-muted-foreground">
                Подтверждённых диагнозов нет.
              </p>
            )}
            {!loading && diagnoses.filter((d) => d.clinicalStatus === "подтверждённый").map((d) => (
              <DiagnosisRow key={d.id} d={d} userId={userId} onSaved={fetchClinical} />
            ))}
          </div>
          {/* Предварительные диагнозы — не становятся актуальными автоматически (VIZ-15) */}
          {!loading && !fetchError && diagnoses.filter((d) => d.clinicalStatus === "предварительный").length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Предварительные
              </p>
              <div className="flex flex-col gap-1.5">
                {diagnoses.filter((d) => d.clinicalStatus === "предварительный").map((d) => (
                  <DiagnosisRow key={d.id} d={d} userId={userId} onSaved={fetchClinical} />
                ))}
              </div>
            </div>
          )}
          <p className={doctorSectionSubtitleClass}>
            по клику на диагноз: подтвердить · уточнить · снять (уходит в историю с датой)
          </p>
        </section>

        {/* Сопутствующие заболевания — реальные данные /api/doctor/patients/[id]/comorbidities */}
        <Comorbidities userId={userId} initialItems={initialComorbidities ?? undefined} />

        {/* Анамнез — real data from /api/doctor/patients/[userId]/anamnesis */}
        <section className={doctorSectionCardClass}>
          <div className="flex items-center justify-between">
            <h3 className={doctorSectionTitleClass}>Анамнез</h3>
            {anamnesisLoading && (
              <span className="animate-pulse text-xs text-muted-foreground">Загрузка…</span>
            )}
            {!anamnesisLoading && anamnesisError && (
              <span className="text-xs text-destructive">Ошибка загрузки</span>
            )}
          </div>

          {/* Травмы и операции */}
          <div className="flex items-center gap-1.5">
            <span className={sectionLabelClass}>Травмы и операции</span>
            {anamnesisAddOpen !== "trauma" && (
              <button
                type="button"
                className={plusBtnClass}
                title="Добавить запись"
                onClick={() => setAnamnesisAddOpen("trauma")}
              >
                +
              </button>
            )}
          </div>
          {anamnesisAddOpen === "trauma" && (
            <AddTraumaForm
              userId={userId}
              onAdded={(entry) => {
                setAnamnesis((prev) => ({ ...prev, trauma: [...prev.trauma, entry] }));
                setAnamnesisAddOpen(null);
              }}
              onCancel={() => setAnamnesisAddOpen(null)}
            />
          )}
          {!anamnesisLoading && anamnesis.trauma.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border py-1 pr-2 font-medium">Год</th>
                  <th className="border-b border-border py-1 pr-2 font-medium">Что</th>
                  <th className="border-b border-border py-1 pr-2 font-medium">Тип</th>
                  <th className="border-b border-border py-1 font-medium">Иммоб.</th>
                </tr>
                {anamnesis.trauma.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="border-b border-border/50 py-1 pr-2">{r.year}</td>
                    <td className="border-b border-border/50 py-1 pr-2">{r.what}</td>
                    <td className="border-b border-border/50 py-1 pr-2">{r.type}</td>
                    <td className="border-b border-border/50 py-1">{r.immobilization}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!anamnesisLoading && !anamnesisError && anamnesis.trauma.length === 0 && anamnesisAddOpen !== "trauma" && (
            <p className="text-xs text-muted-foreground">Травм и операций не внесено.</p>
          )}

          {/* Болезни, стрессы */}
          <div className="flex items-center gap-1.5">
            <span className={sectionLabelClass}>Болезни, стрессы</span>
            {anamnesisAddOpen !== "illness" && (
              <button
                type="button"
                className={plusBtnClass}
                title="Добавить запись"
                onClick={() => setAnamnesisAddOpen("illness")}
              >
                +
              </button>
            )}
          </div>
          {anamnesisAddOpen === "illness" && (
            <AddIllnessForm
              userId={userId}
              onAdded={(entry) => {
                setAnamnesis((prev) => ({ ...prev, illness: [...prev.illness, entry] }));
                setAnamnesisAddOpen(null);
              }}
              onCancel={() => setAnamnesisAddOpen(null)}
            />
          )}
          {!anamnesisLoading && anamnesis.illness.length > 0 && (
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b border-border py-1 pr-2 font-medium">Период</th>
                  <th className="border-b border-border py-1 pr-2 font-medium">Что</th>
                  <th className="border-b border-border py-1 font-medium">Комментарий</th>
                </tr>
                {anamnesis.illness.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="border-b border-border/50 py-1 pr-2">{r.period}</td>
                    <td className="border-b border-border/50 py-1 pr-2">{r.what}</td>
                    <td className="border-b border-border/50 py-1">{r.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!anamnesisLoading && !anamnesisError && anamnesis.illness.length === 0 && anamnesisAddOpen !== "illness" && (
            <p className="text-xs text-muted-foreground">Болезней и стрессов не внесено.</p>
          )}

          {/* Образ жизни */}
          <div className="flex items-center gap-1.5">
            <span className={sectionLabelClass}>Образ жизни</span>
            {anamnesisAddOpen !== "lifestyle" && (
              <button
                type="button"
                className={plusBtnClass}
                title="Добавить запись"
                onClick={() => setAnamnesisAddOpen("lifestyle")}
              >
                +
              </button>
            )}
          </div>
          {anamnesisAddOpen === "lifestyle" && (
            <AddLifestyleForm
              userId={userId}
              onAdded={(entry) => {
                setAnamnesis((prev) => ({ ...prev, lifestyle: [...prev.lifestyle, entry] }));
                setAnamnesisAddOpen(null);
              }}
              onCancel={() => setAnamnesisAddOpen(null)}
            />
          )}
          <div className="flex flex-col gap-1.5">
            {!anamnesisLoading && anamnesis.lifestyle.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-border/70 bg-background/40 px-2.5 py-2 text-sm"
              >
                <div className={cn(doctorSectionSubtitleClass, "mb-0.5")}>Запись от {e.date}</div>
                {e.text}
              </div>
            ))}
            {!anamnesisLoading && !anamnesisError && anamnesis.lifestyle.length === 0 && anamnesisAddOpen !== "lifestyle" && (
              <p className="text-xs text-muted-foreground">Записей об образе жизни нет.</p>
            )}
          </div>
        </section>
      </div>

      {/* ── RIGHT: visits feed / new-visit panel ─────────────────────────── */}
      <div className="flex flex-col gap-2.5">

        {/* ── History header row — ALWAYS at the top of the right column.
             This ensures the toggle arrow (◀/▶) never jumps when panelOpen
             or visitType changes. The «+ Новый визит» button is hidden while
             the form is open to avoid double-open. ────────────────────────── */}
        <div className="flex items-center gap-2">
          {!loading && visits.length > 0 ? (
            <HistoryToggleBtn
              visible={historyVisible}
              onToggle={() => setHistoryVisible((v) => !v)}
            />
          ) : null}
          <h2 className={doctorSectionTitleClass}>История визитов</h2>
          {!loading && (
            <span className={doctorSectionSubtitleClass}>{visits.length} визитов</span>
          )}
          {!panelOpen && (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="ml-auto rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
            >
              + Новый визит
            </button>
          )}
        </div>

        {/* ── New visit form (shown when panelOpen) ────────────────────────── */}
        {panelOpen && (
          <div className={cn("relative z-10", historyVisible ? "max-h-[78vh]" : "max-h-[85vh]")}>
            <NewVisitPanel
              userId={userId}
              activeComplaints={complaints}
              activeDiagnoses={diagnoses}
              pendingVisitDate={pendingVisitDate}
              onClose={() => setPanelOpen(false)}
              onSaved={handleVisitSaved}
            />
          </div>
        )}

        {/* ── History feed (shown when historyVisible) ─────────────────────── */}
        {historyVisible ? (
          <div className={cn(
            "flex flex-col gap-2.5",
            panelOpen && "max-h-[60vh] overflow-y-auto opacity-80",
          )}>
            {loading && (
              <p className="animate-pulse py-2 text-xs text-muted-foreground">Загрузка истории визитов…</p>
            )}
            {!loading && fetchError && (
              <p className="py-1 text-xs text-destructive">Не удалось загрузить историю визитов.</p>
            )}
            {!loading && !fetchError && visits.length === 0 && (
              <p className="py-2 text-xs text-muted-foreground">Визитов пока нет.</p>
            )}
            {!loading && visits.map((v, i) => (
              <VisitCard key={v.id} visit={v} defaultExpanded={i === 0} userId={userId} onSaved={fetchClinical} />
            ))}
            {!panelOpen && (
              <p className={doctorSectionSubtitleClass}>
                История визитов — справа. «+ Новый визит» переключает экран в режим добавления.
                Стрелка ◀ скрывает историю — карта снова видна чётко рядом с формой.
              </p>
            )}
          </div>
        ) : (
          !panelOpen && (
            <p className={doctorSectionSubtitleClass}>
              История скрыта — карта видна слева без блюра. Нажмите ▶, чтобы вернуть историю
              визитов.
            </p>
          )
        )}
      </div>
    </div>
  );
}
