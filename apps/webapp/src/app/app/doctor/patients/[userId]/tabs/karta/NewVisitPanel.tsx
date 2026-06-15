"use client";

/**
 * NewVisitPanel — «+ Новый визит» form wired to the real clinical backend.
 *
 * Props:
 *   userId         — patient user id (injected server-side at POST but needed for catalog API)
 *   activeComplaints — real ActiveComplaint[] from /clinical (used in repeat-visit dynamics)
 *   activeDiagnoses  — real ActiveDiagnosis[] from /clinical (used in repeat-visit refinements)
 *   onClose        — close without saving
 *   onSaved        — called after successful POST /visits; parent re-fetches /clinical
 *
 * Visit types:
 *   first  — doctor-entered complaint rows + diagnosis rows (start empty).
 *   repeat — dynamics cards keyed by real complaint ids; diagnosis-refinement cards
 *            keyed by real diagnosis ids; captures complaintUpdates / diagnosisUpdates.
 *
 * Diagnosis autocomplete:
 *   Debounce-fetches GET /api/doctor/patients/{userId}/diagnosis-catalog?q=…
 *   «+ Создать в справочнике» calls POST /api/doctor/patients/{userId}/diagnosis-catalog
 *   then uses the returned entry (sets text + catalogId).
 *
 * Date:
 *   ISO date string derived from the selected human-label option (YYYY-MM-DD format)
 *   sent as visitedAt.  For the dropdown we generate today ± a few days; today is default.
 *   If needed the parent can later pass an appointmentDate prop to pre-fill.
 *
 * On save:
 *   POST /api/doctor/patients/{userId}/visits with the correct body for visit type.
 *   On success → onSaved() (parent re-fetches + closes panel).
 *   On error → inline error message (does not crash).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveComplaint, ActiveDiagnosis, DiagnosisCatalogSuggestion } from "@/modules/patient-clinical/ports";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisitType = "first" | "repeat";

/** A doctor-entered complaint row for a first visit. */
type FormComplaintEntry = {
  id: string; // local UI id only
  priority: boolean;
  text: string;
  severity: number; // 0–10
};

/** A doctor-entered diagnosis row for a first visit. */
type FormDiagnosisEntry = {
  id: string; // local UI id only
  priority: boolean;
  text: string;
  catalogId: string | null;
};

/** Per-complaint update state for a repeat visit. */
type RepeatComplaintUpdate = {
  complaintId: string;
  note: string;
  severity: number; // new severity 0–10
  resolved: boolean;
};

/** Per-diagnosis update state for a repeat visit. */
type RepeatDiagnosisUpdate = {
  diagnosisId: string;
  refinement: string;
  removed: boolean;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Generate an array of ISO date strings for today ± N days (today first). */
function generateDateOptions(daysAhead = 0, daysBefore = 7): string[] {
  const result: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // today
  result.push(toIsoDate(today));
  // past days
  for (let i = 1; i <= daysBefore; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    result.push(toIsoDate(d));
  }
  // future days (rare but useful)
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    result.push(toIsoDate(d));
  }
  return result;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format ISO date as DD.MM.YYYY for display. */
function fmtDisplay(iso: string): string {
  const [y, m, day] = iso.split("-");
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const chipSelectClass =
  "rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground";
const fieldLabelClass = "text-xs font-semibold text-foreground";
const inputClass =
  "flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const textareaClass =
  "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-y";
const hintClass = "text-xs text-muted-foreground";

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function PriorityFlag({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={on ? "Приоритет: вкл" : "Приоритет: выкл"}
      className={cn("flex-none text-sm leading-none", on ? "text-primary" : "text-muted-foreground")}
    >
      ⚑
    </button>
  );
}

function FormTextarea({
  label,
  placeholder,
  minH = "min-h-[38px]",
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  minH?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabelClass}>{label}</span>
      <textarea
        className={cn(textareaClass, minH)}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnosis autocomplete sub-component
// ---------------------------------------------------------------------------

function DiagnosisAutocomplete({
  userId,
  onSelect,
}: {
  userId: string;
  onSelect: (entry: FormDiagnosisEntry) => void;
}) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<DiagnosisCatalogSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      fetch(`/api/doctor/patients/${userId}/diagnosis-catalog?q=${encodeURIComponent(q)}`)
        .then((r) => r.json() as Promise<{ ok: boolean; suggestions: DiagnosisCatalogSuggestion[] }>)
        .then((data) => {
          setSuggestions(data.suggestions ?? []);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    },
    [userId],
  );

  const handleChange = (v: string) => {
    setDraft(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 280);
  };

  const handleSelect = (s: DiagnosisCatalogSuggestion) => {
    onSelect({
      id: `fd${Date.now()}`,
      priority: false,
      text: s.label,
      catalogId: s.id,
    });
    setDraft("");
    setSuggestions([]);
  };

  const handleCreate = async () => {
    const label = draft.trim();
    if (!label) return;
    try {
      const r = await fetch(`/api/doctor/patients/${userId}/diagnosis-catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = (await r.json()) as { ok: boolean; entry: DiagnosisCatalogSuggestion };
      onSelect({
        id: `fd${Date.now()}`,
        priority: false,
        text: data.entry.label,
        catalogId: data.entry.id,
      });
      setDraft("");
      setSuggestions([]);
    } catch {
      // silently ignore — user can retry
    }
  };

  const showDropdown = draft.trim().length > 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex-none text-sm text-muted-foreground">⚑</span>
        <input
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Начните вводить — поиск по справочнику..."
          className="flex-1 rounded-t-lg border border-primary bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={() => { setDraft(""); setSuggestions([]); }}
          className="flex-none text-sm text-muted-foreground"
        >
          ✕
        </button>
      </div>
      {showDropdown && (
        <div className="mx-[19px] overflow-hidden rounded-b-lg border border-t-0 border-primary bg-background text-sm">
          {loading && (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground animate-pulse">Поиск…</div>
          )}
          {!loading && suggestions.map((s, idx) => (
            <button
              type="button"
              key={s.id}
              onClick={() => handleSelect(s)}
              className={cn(
                "flex w-full items-center gap-1 px-2.5 py-1.5 text-left hover:bg-primary/10",
                idx === 0 && "bg-primary/10",
                idx > 0 && "border-t border-border",
              )}
            >
              <span className="font-semibold text-foreground">{s.label}</span>
              {s.note && <span className={hintClass}>· {s.note}</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={handleCreate}
            className="flex w-full items-center px-2.5 py-1.5 text-left font-medium text-primary hover:bg-primary/10 border-t border-border"
          >
            + Создать в справочнике: «{draft}»
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NewVisitPanel({
  userId,
  activeComplaints,
  activeDiagnoses,
  onClose,
  onSaved,
}: {
  userId: string;
  activeComplaints: ActiveComplaint[];
  activeDiagnoses: ActiveDiagnosis[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [visitType, setVisitType] = useState<VisitType>("repeat");

  // Date options: ISO strings (today is index 0)
  const dateOptions = generateDateOptions(0, 7);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]);
  const [location, setLocation] = useState("");
  const [service, setService] = useState("");
  const [duration, setDuration] = useState("");

  // ── FIRST VISIT state ─────────────────────────────────────────────────────
  const [firstComplaints, setFirstComplaints] = useState<FormComplaintEntry[]>([
    { id: "fc_init", priority: false, text: "", severity: 0 },
  ]);
  const [firstDiagnoses, setFirstDiagnoses] = useState<FormDiagnosisEntry[]>([]);

  // Text section state (first visit)
  const [examFirst, setExamFirst] = useState("");
  const [manipulationsFirst, setManipulationsFirst] = useState("");
  const [trialResultsFirst, setTrialResultsFirst] = useState("");
  const [recommendationsFirst, setRecommendationsFirst] = useState("");

  // ── REPEAT VISIT state ────────────────────────────────────────────────────
  // Keyed by real complaint id (from activeComplaints)
  const [complaintUpdates, setComplaintUpdates] = useState<Record<string, RepeatComplaintUpdate>>(
    () =>
      Object.fromEntries(
        activeComplaints.map((c) => [
          c.id,
          { complaintId: c.id, note: "", severity: c.currentSeverity, resolved: false },
        ]),
      ),
  );

  // Keyed by real diagnosis id (from activeDiagnoses)
  const [diagnosisUpdates, setDiagnosisUpdates] = useState<Record<string, RepeatDiagnosisUpdate>>(
    () =>
      Object.fromEntries(
        activeDiagnoses.map((d) => [
          d.id,
          { diagnosisId: d.id, refinement: "", removed: false },
        ]),
      ),
  );

  // Text section state (repeat visit)
  const [examRepeat, setExamRepeat] = useState("");
  const [manipulationsRepeat, setManipulationsRepeat] = useState("");
  const [recommendationsRepeat, setRecommendationsRepeat] = useState("");

  // Re-seed repeat state when activeComplaints/activeDiagnoses change (e.g. userId switch)
  useEffect(() => {
    setComplaintUpdates(
      Object.fromEntries(
        activeComplaints.map((c) => [
          c.id,
          { complaintId: c.id, note: "", severity: c.currentSeverity, resolved: false },
        ]),
      ),
    );
  }, [activeComplaints]);

  useEffect(() => {
    setDiagnosisUpdates(
      Object.fromEntries(
        activeDiagnoses.map((d) => [
          d.id,
          { diagnosisId: d.id, refinement: "", removed: false },
        ]),
      ),
    );
  }, [activeDiagnoses]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    // Build ISO visitedAt: selectedDate is already YYYY-MM-DD
    const visitedAt = `${selectedDate}T12:00:00.000Z`;

    // Build body — patientUserId + createdBy are injected server-side
    const body: Record<string, unknown> = {
      visitType,
      date: visitedAt,      // API field name from task spec
      location: location || null,
      service: service || null,
      duration: duration || null,
    };

    if (visitType === "first") {
      // Filter out empty complaint rows
      const validComplaints = firstComplaints.filter((c) => c.text.trim());
      if (validComplaints.length > 0) {
        body.complaints = validComplaints.map((c) => ({
          text: c.text,
          priority: c.priority,
          severity: c.severity,
        }));
      }
      const validDiagnoses = firstDiagnoses.filter((d) => d.text.trim());
      if (validDiagnoses.length > 0) {
        body.diagnoses = validDiagnoses.map((d) => ({
          text: d.text,
          priority: d.priority,
          ...(d.catalogId ? { catalogId: d.catalogId } : {}),
        }));
      }
      if (examFirst.trim()) body.exam = examFirst;
      if (manipulationsFirst.trim()) body.manipulations = manipulationsFirst;
      if (trialResultsFirst.trim()) body.trialResults = trialResultsFirst;
      if (recommendationsFirst.trim()) body.recommendations = recommendationsFirst;
    } else {
      // Repeat: only send updates that have content or changed severity
      const cuList = Object.values(complaintUpdates)
        .filter((u) => u.note.trim() || u.resolved || u.severity !== (activeComplaints.find((c) => c.id === u.complaintId)?.currentSeverity ?? u.severity))
        .map((u) => ({
          complaintId: u.complaintId,
          note: u.note,
          severity: u.severity,
          resolved: u.resolved,
        }));
      if (cuList.length > 0) body.complaintUpdates = cuList;

      const duList = Object.values(diagnosisUpdates)
        .filter((u) => u.refinement.trim() || u.removed)
        .map((u) => ({
          diagnosisId: u.diagnosisId,
          ...(u.refinement.trim() ? { refinement: u.refinement } : {}),
          removed: u.removed,
        }));
      if (duList.length > 0) body.diagnosisUpdates = duList;

      if (examRepeat.trim()) body.exam = examRepeat;
      if (manipulationsRepeat.trim()) body.manipulations = manipulationsRepeat;
      if (recommendationsRepeat.trim()) body.recommendations = recommendationsRepeat;
    }

    try {
      const r = await fetch(`/api/doctor/patients/${userId}/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`status ${r.status}${text ? `: ${text}` : ""}`);
      }
      // Success — parent re-fetches /clinical and closes panel
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  // ── Add rows helpers (first visit) ────────────────────────────────────────
  const addFirstComplaint = () =>
    setFirstComplaints((prev) => [
      ...prev,
      { id: `fc${Date.now()}`, priority: false, text: "", severity: 0 },
    ]);

  const addFirstDiagnosis = (entry: FormDiagnosisEntry) =>
    setFirstDiagnoses((prev) => [...prev, entry]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-primary/30 bg-card shadow-lg">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-primary/10 px-3.5 py-2.5">
        <span className="text-sm font-semibold text-foreground">Новый визит</span>
        <span className="flex gap-1">
          {(["first", "repeat"] as const).map((vt) => (
            <button
              key={vt}
              type="button"
              onClick={() => setVisitType(vt)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium",
                visitType === vt
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {vt === "first" ? "Первичный" : "Повторный"}
            </button>
          ))}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Закрыть"
          className="order-last ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
        <span className="flex flex-wrap gap-1.5">
          {/* Date selector — ISO values, human display */}
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={chipSelectClass}
          >
            {dateOptions.map((iso) => (
              <option key={iso} value={iso}>
                {fmtDisplay(iso)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Место приёма"
            className={cn(chipSelectClass, "w-32 placeholder:text-muted-foreground/60")}
          />
          <input
            type="text"
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="Услуга"
            className={cn(chipSelectClass, "w-28 placeholder:text-muted-foreground/60")}
          />
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Длительность"
            className={cn(chipSelectClass, "w-24 placeholder:text-muted-foreground/60")}
          />
        </span>
      </div>
      <p className={cn(hintClass, "border-b border-border px-3.5 py-1.5")}>
        Если у пациента есть запись на сегодня — дата, локация, услуга и длительность подставляются из
        неё автоматически
      </p>

      {/* body (independently scrollable) */}
      <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {visitType === "first" ? (
          <>
            {/* Жалобы (first visit — doctor-entered, start with one blank row) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={fieldLabelClass}>Жалобы</span>
                <button
                  type="button"
                  onClick={addFirstComplaint}
                  title="Добавить жалобу"
                  className="grid h-[17px] w-[17px] place-items-center rounded-md border border-primary/40 text-xs text-primary"
                >
                  +
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {firstComplaints.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <PriorityFlag
                      on={c.priority}
                      onToggle={() =>
                        setFirstComplaints((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, priority: !x.priority } : x)),
                        )
                      }
                    />
                    <input
                      value={c.text}
                      onChange={(e) =>
                        setFirstComplaints((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)),
                        )
                      }
                      placeholder="Описание жалобы…"
                      className={inputClass}
                    />
                    <span className="flex flex-none items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={c.severity}
                        onChange={(e) =>
                          setFirstComplaints((prev) =>
                            prev.map((x) =>
                              x.id === c.id ? { ...x, severity: Number(e.target.value) } : x,
                            ),
                          )
                        }
                        className="w-11 rounded-md border border-border bg-background px-1 py-1 text-center text-sm text-foreground"
                      />
                      /10
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFirstComplaints((prev) => prev.filter((x) => x.id !== c.id))
                      }
                      title="Удалить"
                      className="flex-none text-sm text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <p className={hintClass}>
                Каждая строка — жалоба-сущность с выраженностью 0–10: попадает в карту как
                «актуальная». Значение обновляется на каждом визите → график динамики. ⚑ — приоритет
              </p>
            </div>

            <FormTextarea
              label="Осмотр"
              placeholder="РДН ~1 см пр>лев, тест Адамса отрицательный..."
              minH="min-h-[54px]"
              value={examFirst}
              onChange={setExamFirst}
            />

            {/* Предварительный диагноз (first visit — doctor-entered via catalog) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={fieldLabelClass}>Предварительный диагноз</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {firstDiagnoses.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <PriorityFlag
                      on={d.priority}
                      onToggle={() =>
                        setFirstDiagnoses((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, priority: !x.priority } : x)),
                        )
                      }
                    />
                    <span className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground">
                      {d.text}
                      {d.catalogId && (
                        <span className="ml-1 text-xs text-muted-foreground">· справочник</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFirstDiagnoses((prev) => prev.filter((x) => x.id !== d.id))}
                      title="Удалить"
                      className="flex-none text-sm text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {/* Autocomplete input */}
                <DiagnosisAutocomplete userId={userId} onSelect={addFirstDiagnosis} />
              </div>
              <p className={hintClass}>
                Диагнозы — из справочника клинических диагнозов: автокомплит по вводу,
                новый создаётся в справочнике и переиспользуется у других пациентов
              </p>
            </div>

            <FormTextarea
              label="Проведённые манипуляции"
              placeholder="ФМ на область поясницы, трохантера, ягодицы"
              value={manipulationsFirst}
              onChange={setManipulationsFirst}
            />
            <FormTextarea
              label="Результаты пробного лечения"
              placeholder="Уменьшение боли в наклоне"
              value={trialResultsFirst}
              onChange={setTrialResultsFirst}
            />
            <FormTextarea
              label="Рекомендации / Назначения"
              placeholder="ЛФК, курс 3 сеанса фасциальных манипуляций"
              value={recommendationsFirst}
              onChange={setRecommendationsFirst}
            />
          </>
        ) : (
          <>
            {/* Динамика симптомов — real active complaints, keyed by id */}
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Динамика симптомов — по актуальным жалобам</span>
              {activeComplaints.length === 0 && (
                <p className={hintClass}>Нет активных жалоб — добавьте жалобы через первичный визит.</p>
              )}
              <div className="flex flex-col gap-2">
                {activeComplaints.map((c) => {
                  const upd = complaintUpdates[c.id] ?? {
                    complaintId: c.id,
                    note: "",
                    severity: c.currentSeverity,
                    resolved: false,
                  };
                  const setUpd = (patch: Partial<RepeatComplaintUpdate>) =>
                    setComplaintUpdates((prev) => ({
                      ...prev,
                      [c.id]: { ...upd, ...patch },
                    }));
                  return (
                    <div key={c.id} className="rounded-lg border border-border bg-muted/15 p-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {c.priority ? <span className="text-primary">⚑</span> : null}
                        <span>{c.text}</span>
                        <span className="ml-auto">{c.since}</span>
                      </div>
                      <textarea
                        className={cn(textareaClass, "mt-1.5 min-h-[40px]")}
                        placeholder="Боли реже и меньше — после 2 часов ходьбы..."
                        value={upd.note}
                        onChange={(e) => setUpd({ note: e.target.value })}
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          Выраженность: <span>было {c.currentSeverity}/10</span> →
                          <input
                            type="number"
                            min={0}
                            max={10}
                            value={upd.severity}
                            onChange={(e) => setUpd({ severity: Number(e.target.value) })}
                            className="w-11 rounded-md border border-border bg-background px-1 py-1 text-center text-sm text-foreground"
                          />
                          /10
                        </span>
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={upd.resolved}
                            onChange={(e) => setUpd({ resolved: e.target.checked })}
                          />
                          Решена — снять
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <FormTextarea
              label="Осмотр"
              placeholder="Данные объективного осмотра…"
              minH="min-h-[54px]"
              value={examRepeat}
              onChange={setExamRepeat}
            />

            {/* Уточнение диагноза — real active diagnoses, keyed by id */}
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Уточнение диагноза — по текущим</span>
              {activeDiagnoses.length === 0 && (
                <p className={hintClass}>Нет активных диагнозов — добавьте через первичный визит.</p>
              )}
              <div className="flex flex-col gap-2">
                {activeDiagnoses.map((d) => {
                  const upd = diagnosisUpdates[d.id] ?? {
                    diagnosisId: d.id,
                    refinement: "",
                    removed: false,
                  };
                  const setUpd = (patch: Partial<RepeatDiagnosisUpdate>) =>
                    setDiagnosisUpdates((prev) => ({
                      ...prev,
                      [d.id]: { ...upd, ...patch },
                    }));
                  return (
                    <div key={d.id} className="rounded-lg border border-border bg-muted/15 p-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {d.priority ? <span className="text-primary">⚑</span> : null}
                        <span>{d.text}</span>
                        <span className="ml-auto text-[11px]">{d.meta}</span>
                      </div>
                      <input
                        value={upd.refinement}
                        onChange={(e) => setUpd({ refinement: e.target.value })}
                        placeholder="Уточнение (из справочника)..."
                        className={cn(inputClass, "mt-1.5 w-full")}
                      />
                      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={upd.removed}
                          onChange={(e) => setUpd({ removed: e.target.checked })}
                        />
                        Снять диагноз
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <FormTextarea
              label="Проведённые манипуляции"
              placeholder="Сухая игла на область сух прав БЯМ..."
              value={manipulationsRepeat}
              onChange={setManipulationsRepeat}
            />
            <FormTextarea
              label="Рекомендации / Назначения — коррекция"
              placeholder="Продолжаем программу ЛФК для ТБС, акцент на ягодичный мост..."
              value={recommendationsRepeat}
              onChange={setRecommendationsRepeat}
            />
          </>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-3.5 py-2.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Сохранение…" : "Сохранить визит"}
        </button>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
        >
          Прикрепить файлы
        </button>
        {saveError && (
          <span className="text-xs text-destructive">{saveError}</span>
        )}
        {!saveError && (
          <span className={cn(hintClass, "ml-auto")}>
            Пустые секции не сохраняются и не показываются в ленте
          </span>
        )}
      </div>
    </div>
  );
}
