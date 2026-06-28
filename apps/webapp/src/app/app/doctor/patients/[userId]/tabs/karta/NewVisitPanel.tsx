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
import { DoctorDatePicker } from "@/shared/ui/doctor/DoctorDatePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/shared/ui/doctor/primitives/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";

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

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
          type="search"
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Начните вводить — поиск по справочнику..."
          autoComplete="off"
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
  pendingVisitDate,
  pendingLocation,
  pendingService,
  onPendingConsumed,
  onClose,
  onSaved,
}: {
  userId: string;
  activeComplaints: ActiveComplaint[];
  activeDiagnoses: ActiveDiagnosis[];
  /** ISO date string (YYYY-MM-DD) to pre-fill the visit date from the appointment. */
  pendingVisitDate?: string | null;
  /** Location (branch name) from the source appointment — pre-fills location field. */
  pendingLocation?: string | null;
  /** Service name from the source appointment — pre-fills service field. */
  pendingService?: string | null;
  /** Called once after this component captures pending props into state, so the parent can
   *  safely reset its pending* fields without racing the useState() initializers. */
  onPendingConsumed?: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [visitType, setVisitType] = useState<VisitType>("repeat");

  const [selectedDate, setSelectedDate] = useState(() =>
    pendingVisitDate ? pendingVisitDate : toIsoDate(new Date()),
  );

  // Visit time (HH:MM) — stored as part of visitedAt timestamp.
  // Defaults to the current time rounded to nearest 5 min.
  const [selectedTime, setSelectedTime] = useState(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(Math.round(now.getMinutes() / 5) * 5 % 60).padStart(2, "0");
    return `${h}:${m}`;
  });

  // If pendingVisitDate changes after initial render (e.g. parent updates), sync it in.
  useEffect(() => {
    if (pendingVisitDate) {
      setSelectedDate(pendingVisitDate);
    }
  }, [pendingVisitDate]);

  const [location, setLocation] = useState(() => pendingLocation ?? "");
  const [service, setService] = useState(() => pendingService ?? "");
  // Duration is always resolved from the service catalog (service-watching effect below), never
  // copied from the source appointment — per owner decision 2026-06-24.
  // parseDurationFromTitle — fallback for services absent from the catalog (legacy/Rubitime).
  const parseDurationFromTitle = (svc?: string | null): string => {
    const m = svc?.match(/(\d+)\s*мин/);
    return m ? `${m[1]} мин` : "";
  };
  const [duration, setDuration] = useState("");

  // Catalog options populated from patient appointments history
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [durationOptions, setDurationOptions] = useState<string[]>([]);
  // Booking-engine service catalog (title → registered durationMinutes) — the source of truth for
  // a visit's duration once a service is chosen/prefilled.
  const [serviceCatalog, setServiceCatalog] = useState<{ title: string; durationMinutes: number }[]>([]);
  // "other" mode for each field when user selects "Другое..."
  const [locationOther, setLocationOther] = useState(false);
  const [serviceOther, setServiceOther] = useState(false);
  const [durationOther, setDurationOther] = useState(false);

  // ── Draft persistence (#205) ───────────────────────────────────────────────
  // localStorage key is per-patient so drafts don't bleed across patients.
  const draftKey = `nvp_draft_${userId}`;

  // Close-confirm state: shows a dialog if user clicks ✕ with unsaved changes.
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // Sync pending prefill fields if they change after initial render (e.g. user clicks
  // «Оформить визит» on a different appointment while the panel is already open).
  // Also fires on mount — that's intentional: the useState() initializers have already captured
  // the values, so this is the safe moment to call onPendingConsumed and let the parent reset
  // its pending* state without losing the prefilled location/service.
  useEffect(() => {
    if (pendingLocation) setLocation(pendingLocation);
    if (pendingService) setService(pendingService);
    // Duration is NOT set here — the service-watching effect resolves it from the catalog.
    if (pendingLocation || pendingService) {
      onPendingConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLocation, pendingService]);

  // Single source of a visit's duration once a service is set (prefilled OR manually picked) and the
  // field is still empty: look it up in the booking-engine service catalog by title — robust for any
  // service whose name carries no «N мин» («Маникюр», «Очный приём»). Falls back to parsing «N мин»
  // from the title only for services absent from the catalog (legacy/Rubitime). A numeric duration
  // already filled or a custom «Другое…» entry is never overwritten.
  useEffect(() => {
    if (durationOther || duration.trim()) return;
    const svc = service.trim();
    if (!svc) return;
    const fromCatalog = serviceCatalog.find((s) => s.title === svc)?.durationMinutes;
    const value = fromCatalog ? `${fromCatalog} мин` : parseDurationFromTitle(svc);
    if (value) setDuration(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, serviceCatalog]);

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

  // Auto-switch visitType based on whether patient has active complaints/diagnoses
  useEffect(() => {
    if (activeComplaints.length === 0 && activeDiagnoses.length === 0) {
      setVisitType("first");
    } else {
      setVisitType("repeat");
    }
  }, [activeComplaints, activeDiagnoses]);

  // Populate location/service/duration from patient appointments history + booking-engine catalog
  useEffect(() => {
    // Snapshot pending prefill values at the time the effect runs so lint doesn't require
    // them as dependencies (we deliberately run this only when userId changes).
    const snapshotLocation = pendingLocation;
    const snapshotService = pendingService;

    const apptsFetch = fetch(`/api/doctor/patients/${userId}/appointments`)
      .then((r) => (r.ok ? (r.json() as Promise<{ appointments?: Array<{ location?: string; branchName?: string; serviceName?: string; durationMin?: number }> }>) : null))
      .catch(() => null);

    const servicesFetch = fetch(`/api/doctor/booking-engine/services`)
      .then((r) => (r.ok ? (r.json() as Promise<{ ok: boolean; services?: Array<{ title: string; durationMinutes: number; isActive: boolean }> }>) : null))
      .catch(() => null);

    void Promise.all([apptsFetch, servicesFetch]).then(([apptData, servicesData]) => {
      const appts = apptData?.appointments ?? [];

      const uniqueLocations = [...new Set(
        appts.map((a) => a.branchName ?? a.location ?? "").filter(Boolean)
      )];

      // Merge appointment history services with booking-engine active services
      const apptServices = appts.map((a) => a.serviceName ?? "").filter(Boolean);
      const catalogServices = (servicesData?.services ?? [])
        .filter((s) => s.isActive)
        .map((s) => s.title);
      const uniqueServices = [...new Set([...apptServices, ...catalogServices])];

      // Merge appointment history durations with booking-engine active durations
      const apptDurations = appts.map((a) => (a.durationMin ? `${a.durationMin} мин` : "")).filter(Boolean);
      const catalogDurations = (servicesData?.services ?? [])
        .filter((s) => s.isActive)
        .map((s) => `${s.durationMinutes} мин`);
      const uniqueDurations = [...new Set([...apptDurations, ...catalogDurations])];

      setLocationOptions(uniqueLocations);
      setServiceOptions(uniqueServices);
      setDurationOptions(uniqueDurations);
      // Include inactive services too — the dropdown can still offer an archived service via
      // appointment history, and its registered duration is just as valid for lookup.
      setServiceCatalog(
        (servicesData?.services ?? []).map((s) => ({ title: s.title, durationMinutes: s.durationMinutes })),
      );

      // Pre-fill location/service from the most recent appointment — but don't overwrite values
      // already pre-filled from the source appointment (snapshotted above to keep [userId] dep-only).
      // Duration is intentionally NOT set here: it is resolved from the service catalog by the
      // service-watching effect above, so it always matches the displayed service.
      const latest = appts[0];
      if (latest) {
        if (!snapshotLocation && (latest.branchName ?? latest.location))
          setLocation(latest.branchName ?? latest.location ?? "");
        if (!snapshotService && latest.serviceName) setService(latest.serviceName);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Draft persistence + isDirty (#205) ────────────────────────────────────

  // Collect all user-editable text/select fields into a snapshot for the draft.
  // We track: examFirst, manipulationsFirst, trialResultsFirst, recommendationsFirst,
  // examRepeat, manipulationsRepeat, recommendationsRepeat (pure text content that the
  // doctor types). location/service/duration are excluded — they come from appointment
  // prefill and the catalog, so restoring them is noisy. visitType is included so the
  // form reopens in the same mode.
  type VisitDraft = {
    visitType: VisitType;
    examFirst: string;
    manipulationsFirst: string;
    trialResultsFirst: string;
    recommendationsFirst: string;
    examRepeat: string;
    manipulationsRepeat: string;
    recommendationsRepeat: string;
  };

  // isDirty — true when any text field the doctor typed has content.
  const isDirty =
    examFirst.trim() !== "" ||
    manipulationsFirst.trim() !== "" ||
    trialResultsFirst.trim() !== "" ||
    recommendationsFirst.trim() !== "" ||
    examRepeat.trim() !== "" ||
    manipulationsRepeat.trim() !== "" ||
    recommendationsRepeat.trim() !== "" ||
    firstComplaints.some((c) => c.text.trim() !== "") ||
    firstDiagnoses.length > 0 ||
    Object.values(complaintUpdates).some((u) => u.note.trim() !== "");

  // Restore draft on mount (only if there is no pending appointment prefill — prefer
  // the appointment data over a stale draft).
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    // If an appointment is being pre-filled, skip draft restore to avoid conflicts.
    if (pendingVisitDate ?? pendingLocation ?? pendingService) return;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(draftKey) : null;
      if (!raw) return;
      const d = JSON.parse(raw) as VisitDraft;
      if (d.visitType) setVisitType(d.visitType);
      if (d.examFirst) setExamFirst(d.examFirst);
      if (d.manipulationsFirst) setManipulationsFirst(d.manipulationsFirst);
      if (d.trialResultsFirst) setTrialResultsFirst(d.trialResultsFirst);
      if (d.recommendationsFirst) setRecommendationsFirst(d.recommendationsFirst);
      if (d.examRepeat) setExamRepeat(d.examRepeat);
      if (d.manipulationsRepeat) setManipulationsRepeat(d.manipulationsRepeat);
      if (d.recommendationsRepeat) setRecommendationsRepeat(d.recommendationsRepeat);
    } catch {
      // Malformed draft — ignore.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft to localStorage whenever editable fields change.
  useEffect(() => {
    if (!isDirty) return; // don't write empty drafts
    try {
      const draft: VisitDraft = {
        visitType,
        examFirst,
        manipulationsFirst,
        trialResultsFirst,
        recommendationsFirst,
        examRepeat,
        manipulationsRepeat,
        recommendationsRepeat,
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // localStorage unavailable — silently skip.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDirty,
    visitType,
    examFirst, manipulationsFirst, trialResultsFirst, recommendationsFirst,
    examRepeat, manipulationsRepeat, recommendationsRepeat,
  ]);

  // Clear draft on successful save.
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }, [draftKey]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null);

    // Client-side validation — required fields (VIZ-13)
    const missing: string[] = [];
    if (!location.trim()) missing.push("Место приёма");
    if (!service.trim()) missing.push("Услуга");
    if (!duration.trim()) missing.push("Длительность");
    if (missing.length > 0) {
      setSaveError(`Заполните обязательные поля: ${missing.join(", ")}`);
      return;
    }

    setSaving(true);

    // Build ISO visitedAt from selected date + time (interpreted as local Moscow time for
    // consistency with the existing UI convention; the DB stores with TZ).
    const visitedAt = `${selectedDate}T${selectedTime}:00`;

    // Build body — patientUserId + createdBy are injected server-side
    const body: Record<string, unknown> = {
      visitType,
      date: visitedAt,      // API field name from task spec
      location: location.trim() || undefined,
      service: service.trim() || undefined,
      duration: duration.trim() || undefined,
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
      // Success — clear draft and let parent re-fetch /clinical and close panel
      clearDraft();
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
          onClick={() => {
            if (isDirty) { setCloseConfirmOpen(true); return; }
            onClose();
          }}
          title="Закрыть"
          className="order-last ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
        <span className="flex flex-wrap gap-1.5">
          {/* Date picker — DoctorDatePicker (shared project picker, ISO yyyy-MM-dd) */}
          <DoctorDatePicker value={selectedDate} onChange={setSelectedDate} />
          {/* Time picker — plain input[type=time], value synced to selectedTime */}
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className={cn(chipSelectClass, "w-[6.5rem]")}
            title="Время визита"
          />
          {locationOptions.length > 0 && !locationOther ? (
            <Select
              value={location}
              onValueChange={(v) => {
                if (v === "__other__") { setLocationOther(true); setLocation(""); }
                else setLocation(v ?? "");
              }}
            >
              <SelectTrigger
                displayLabel={location || "— место приёма —"}
                className="h-[26px] min-w-[7.5rem] px-2 text-xs"
              />
              <SelectContent>
                <SelectItem value="">— место приёма —</SelectItem>
                {locationOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value="__other__">Другое...</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Место приёма"
              className={cn(chipSelectClass, "w-32 placeholder:text-muted-foreground/60")}
            />
          )}
          {serviceOptions.length > 0 && !serviceOther ? (
            <Select
              value={service}
              onValueChange={(v) => {
                if (v === "__other__") { setServiceOther(true); setService(""); setDuration(""); setDurationOther(false); }
                else { setService(v ?? ""); setDuration(""); setDurationOther(false); }
              }}
            >
              <SelectTrigger
                displayLabel={service || "— услуга —"}
                className="h-[26px] min-w-[7rem] px-2 text-xs"
              />
              <SelectContent>
                <SelectItem value="">— услуга —</SelectItem>
                {serviceOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value="__other__">Другое...</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="Услуга"
              className={cn(chipSelectClass, "w-28 placeholder:text-muted-foreground/60")}
            />
          )}
          {durationOptions.length > 0 && !durationOther ? (
            <Select
              value={duration}
              onValueChange={(v) => {
                if (v === "__other__") { setDurationOther(true); setDuration(""); }
                else setDuration(v ?? "");
              }}
            >
              <SelectTrigger
                displayLabel={duration || "— длит. —"}
                className="h-[26px] min-w-[6rem] px-2 text-xs"
              />
              <SelectContent>
                <SelectItem value="">— длит. —</SelectItem>
                {durationOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value="__other__">Другое...</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Длительность"
              className={cn(chipSelectClass, "w-24 placeholder:text-muted-foreground/60")}
            />
          )}
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
                    {firstComplaints.length > 1 && (
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
                    )}
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
              placeholder="Данные объективного осмотра…"
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
              placeholder="Проведённые манипуляции…"
              value={manipulationsFirst}
              onChange={setManipulationsFirst}
            />
            <FormTextarea
              label="Результаты пробного лечения"
              placeholder="Динамика / результат…"
              value={trialResultsFirst}
              onChange={setTrialResultsFirst}
            />
            <FormTextarea
              label="Рекомендации / Назначения"
              placeholder="Рекомендации / назначения…"
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
                        placeholder="Динамика жалобы…"
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
              placeholder="Проведённые манипуляции…"
              value={manipulationsRepeat}
              onChange={setManipulationsRepeat}
            />
            <FormTextarea
              label="Рекомендации / Назначения — коррекция"
              placeholder="Рекомендации / назначения…"
              value={recommendationsRepeat}
              onChange={setRecommendationsRepeat}
            />
          </>
        )}
      </div>

      {/* footer */}
      <div className="flex flex-col gap-0 border-t border-border">
        {saveError && (
          <div className="flex items-center gap-1.5 bg-destructive/10 px-3.5 py-2 text-sm font-medium text-destructive">
            <span>⚠</span>
            <span>{saveError}</span>
          </div>
        )}
        <div className="flex items-center gap-2 bg-muted/20 px-3.5 py-2.5">
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
          {!saveError && (
            <span className={cn(hintClass, "ml-auto")}>
              Ручное сохранение — данные не сохраняются до нажатия «Сохранить визит»
            </span>
          )}
        </div>
      </div>

      {/* Close-with-unsaved-changes confirm dialog (#205) */}
      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Несохранённые изменения</DialogTitle>
            <DialogDescription>
              Введённые данные не сохранены. Закрыть форму и потерять изменения?
              <br />
              <span className="mt-1 block text-xs">
                Черновик сохранён — он будет восстановлен при следующем открытии формы.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCloseConfirmOpen(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
            >
              Вернуться к редактированию
            </button>
            <button
              type="button"
              onClick={() => { setCloseConfirmOpen(false); onClose(); }}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
            >
              Закрыть без сохранения
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
