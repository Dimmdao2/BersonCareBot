"use client";

/**
 * NewVisitPanel — «+ Новый визит» form wired to the real clinical backend.
 *
 * Props:
 *   userId             — patient user id
 *   activeComplaints   — real ActiveComplaint[] from /clinical
 *   activeDiagnoses    — real ActiveDiagnosis[] from /clinical
 *   sourceAppointment  — when created from a booking: appointment data for calendar-icon preview
 *   onClose            — close without saving
 *   onSaved            — called after successful POST /visits; parent re-fetches /clinical
 *
 * Changes from prior version (#208):
 *   - DURATION field fully removed (input, state, validation, API payload).
 *   - Branch dropdown now filters services by location (booking-engine locationAvailability).
 *   - Calendar icon (📅) appears next to branch/service when a source appointment is linked;
 *     clicking it shows a read-only mini-modal with appointment details.
 *   - appointmentRecordId sent on save when created from a booking.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActiveComplaint, ActiveDiagnosis, DiagnosisCatalogSuggestion } from "@/modules/patient-clinical/ports";
import type { PatientAppointmentItem } from "@/modules/doctor-clients/ports";
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

type FormComplaintEntry = {
  id: string;
  priority: boolean;
  text: string;
  severity: number;
};

type FormDiagnosisEntry = {
  id: string;
  priority: boolean;
  text: string;
  catalogId: string | null;
};

type RepeatComplaintUpdate = {
  complaintId: string;
  note: string;
  severity: number;
  resolved: boolean;
};

type RepeatDiagnosisUpdate = {
  diagnosisId: string;
  refinement: string;
  removed: boolean;
};

/** Service from booking-engine catalog with optional branch filter data. */
type ServiceOption = {
  id: string;
  title: string;
  isActive: boolean;
};

/** Service-location link: which services are available in which branches. */
type LocationAvailabilityEntry = {
  serviceId: string;
  branchId: string;
  isActive: boolean;
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
      // silently ignore
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
// Booking info mini-modal (read-only, triggered by calendar icon)
// ---------------------------------------------------------------------------

function BookingInfoModal({
  appointment,
  open,
  onClose,
}: {
  appointment: PatientAppointmentItem;
  open: boolean;
  onClose: () => void;
}) {
  const dt = appointment.dateTime
    ? new Date(appointment.dateTime).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const statusLabel: Record<string, string> = {
    upcoming: "Предстоящая",
    completed: "Состоялась",
    rescheduled: "Перенесена",
    canceled: "Отменена",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Запись на приём</DialogTitle>
          <DialogDescription>
            <span className="flex flex-col gap-1.5 pt-1 text-sm text-foreground">
              <span className="flex gap-2">
                <span className="w-24 flex-none text-muted-foreground">Дата/время</span>
                <span>{dt}</span>
              </span>
              <span className="flex gap-2">
                <span className="w-24 flex-none text-muted-foreground">Статус</span>
                <span>{statusLabel[appointment.status] ?? appointment.status}</span>
              </span>
              {appointment.location && (
                <span className="flex gap-2">
                  <span className="w-24 flex-none text-muted-foreground">Филиал</span>
                  <span>{appointment.location}</span>
                </span>
              )}
              {appointment.serviceName && (
                <span className="flex gap-2">
                  <span className="w-24 flex-none text-muted-foreground">Услуга</span>
                  <span>{appointment.serviceName}</span>
                </span>
              )}
              <span className="flex gap-2">
                <span className="w-24 flex-none text-muted-foreground">ID записи</span>
                <span className="break-all font-mono text-xs text-muted-foreground">{appointment.id}</span>
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
          >
            Закрыть
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  sourceAppointment,
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
  /**
   * The booking this visit is being created from (optional).
   * When set: appointment info is shown via calendar icon (📅).
   * When saving: appointmentRecordId (internalId) is included in the POST body.
   */
  sourceAppointment?: PatientAppointmentItem | null;
  /** Called once after this component captures pending props into state. */
  onPendingConsumed?: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [visitType, setVisitType] = useState<VisitType>("repeat");

  // Derive initial date from: pendingVisitDate prop > sourceAppointment.dateTime > today
  const [selectedDate, setSelectedDate] = useState(() => {
    if (pendingVisitDate) return pendingVisitDate;
    if (sourceAppointment?.dateTime) {
      const d = new Date(sourceAppointment.dateTime);
      return toIsoDate(d);
    }
    return toIsoDate(new Date());
  });

  // Derive initial time from: sourceAppointment.dateTime > current time
  const [selectedTime, setSelectedTime] = useState(() => {
    if (sourceAppointment?.dateTime) {
      const d = new Date(sourceAppointment.dateTime);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(Math.round(now.getMinutes() / 5) * 5 % 60).padStart(2, "0");
    return `${h}:${m}`;
  });

  useEffect(() => {
    if (pendingVisitDate) {
      setSelectedDate(pendingVisitDate);
    }
  }, [pendingVisitDate]);

  const [location, setLocation] = useState(() => pendingLocation ?? "");
  const [service, setService] = useState(() => pendingService ?? "");

  // Booking-engine service catalog for branch-filtered dropdowns
  const [allServices, setAllServices] = useState<ServiceOption[]>([]);
  const [locationAvailability, setLocationAvailability] = useState<LocationAvailabilityEntry[]>([]);
  // Historical locations from past appointments
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  // Map from branch name → branch id (for filtering services)
  const [branchNameToId, setBranchNameToId] = useState<Record<string, string>>({});

  // "other" mode for each field when user selects "Другое..."
  const [locationOther, setLocationOther] = useState(false);
  const [serviceOther, setServiceOther] = useState(false);

  // Calendar icon modal state
  const [bookingInfoOpen, setBookingInfoOpen] = useState(false);

  // Sync pending prefill fields if they change after initial render
  useEffect(() => {
    if (pendingLocation) setLocation(pendingLocation);
    if (pendingService) setService(pendingService);
    if (pendingLocation || pendingService) {
      onPendingConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLocation, pendingService]);

  // Derive services available in the currently selected branch
  const servicesForCurrentBranch = (() => {
    const branchId = branchNameToId[location] ?? null;
    if (!branchId || locationAvailability.length === 0) {
      // No branch-service map available: show all active services
      return allServices.filter((s) => s.isActive);
    }
    const serviceIdsInBranch = new Set(
      locationAvailability
        .filter((la) => la.branchId === branchId && la.isActive)
        .map((la) => la.serviceId),
    );
    return allServices.filter((s) => s.isActive && serviceIdsInBranch.has(s.id));
  })();

  // Populate locations + service catalog from appointments history + booking-engine
  useEffect(() => {
    const snapshotLocation = pendingLocation;
    const snapshotService = pendingService;

    const apptsFetch = fetch(`/api/doctor/patients/${userId}/appointments`)
      .then((r) => (r.ok ? (r.json() as Promise<{ appointments?: Array<{ location?: string; branchName?: string; serviceName?: string }> }>) : null))
      .catch(() => null);

    const servicesFetch = fetch(`/api/doctor/booking-engine/services`)
      .then((r) => (r.ok ? (r.json() as Promise<{
        ok: boolean;
        services?: Array<{ id: string; title: string; isActive: boolean }>;
        locationAvailability?: Array<{ serviceId: string; branchId: string; isActive: boolean }>;
      }>) : null))
      .catch(() => null);

    // Fetch branches to build name→id map
    const overviewFetch = fetch(`/api/doctor/booking-engine/overview`)
      .then((r) => (r.ok ? (r.json() as Promise<{
        ok: boolean;
        branches?: Array<{ id: string; title: string; shortTitle: string | null; isActive: boolean }>;
      }>) : null))
      .catch(() => null);

    void Promise.all([apptsFetch, servicesFetch, overviewFetch]).then(([apptData, servicesData, overviewData]) => {
      const appts = apptData?.appointments ?? [];

      const uniqueLocations = [...new Set(
        appts.map((a) => a.branchName ?? a.location ?? "").filter(Boolean),
      )];
      setLocationOptions(uniqueLocations);

      setAllServices(
        (servicesData?.services ?? []).map((s) => ({ id: s.id, title: s.title, isActive: s.isActive })),
      );
      setLocationAvailability(servicesData?.locationAvailability ?? []);

      // Build branch name → id map from overview
      const nameToId: Record<string, string> = {};
      for (const b of (overviewData?.branches ?? [])) {
        nameToId[b.title] = b.id;
        if (b.shortTitle) nameToId[b.shortTitle] = b.id;
      }
      setBranchNameToId(nameToId);

      // Pre-fill location from the most recent appointment (if not already set from source)
      const latest = appts[0];
      if (latest) {
        if (!snapshotLocation && (latest.branchName ?? latest.location)) {
          setLocation(latest.branchName ?? latest.location ?? "");
        }
        if (!snapshotService && latest.serviceName) setService(latest.serviceName);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Draft persistence (#205) ───────────────────────────────────────────────
  const draftKey = `nvp_draft_${userId}`;

  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // ── FIRST VISIT state ─────────────────────────────────────────────────────
  const [firstComplaints, setFirstComplaints] = useState<FormComplaintEntry[]>([
    { id: "fc_init", priority: false, text: "", severity: 0 },
  ]);
  const [firstDiagnoses, setFirstDiagnoses] = useState<FormDiagnosisEntry[]>([]);

  const [examFirst, setExamFirst] = useState("");
  const [manipulationsFirst, setManipulationsFirst] = useState("");
  const [trialResultsFirst, setTrialResultsFirst] = useState("");
  const [recommendationsFirst, setRecommendationsFirst] = useState("");

  // ── REPEAT VISIT state ────────────────────────────────────────────────────
  const [complaintUpdates, setComplaintUpdates] = useState<Record<string, RepeatComplaintUpdate>>(
    () =>
      Object.fromEntries(
        activeComplaints.map((c) => [
          c.id,
          { complaintId: c.id, note: "", severity: c.currentSeverity, resolved: false },
        ]),
      ),
  );

  const [diagnosisUpdates, setDiagnosisUpdates] = useState<Record<string, RepeatDiagnosisUpdate>>(
    () =>
      Object.fromEntries(
        activeDiagnoses.map((d) => [
          d.id,
          { diagnosisId: d.id, refinement: "", removed: false },
        ]),
      ),
  );

  const [examRepeat, setExamRepeat] = useState("");
  const [manipulationsRepeat, setManipulationsRepeat] = useState("");
  const [recommendationsRepeat, setRecommendationsRepeat] = useState("");

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

  useEffect(() => {
    if (activeComplaints.length === 0 && activeDiagnoses.length === 0) {
      setVisitType("first");
    } else {
      setVisitType("repeat");
    }
  }, [activeComplaints, activeDiagnoses]);

  // ── Draft persistence + isDirty (#205) ────────────────────────────────────

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

  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
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
      // Malformed draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDirty) return;
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
      // localStorage unavailable
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDirty,
    visitType,
    examFirst, manipulationsFirst, trialResultsFirst, recommendationsFirst,
    examRepeat, manipulationsRepeat, recommendationsRepeat,
  ]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }, [draftKey]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null);

    // Client-side validation — required fields
    const missing: string[] = [];
    if (!location.trim()) missing.push("Место приёма");
    if (!service.trim()) missing.push("Услуга");
    if (missing.length > 0) {
      setSaveError(`Заполните обязательные поля: ${missing.join(", ")}`);
      return;
    }

    setSaving(true);

    const visitedAt = `${selectedDate}T${selectedTime}:00`;

    const body: Record<string, unknown> = {
      visitType,
      date: visitedAt,
      location: location.trim() || undefined,
      service: service.trim() || undefined,
      // appointmentRecordId links the visit to the source booking (uses internalId = appointment_records.id uuid)
      ...(sourceAppointment?.internalId
        ? { appointmentRecordId: sourceAppointment.internalId }
        : {}),
    };

    if (visitType === "first") {
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
        <span className="flex flex-wrap items-center gap-1.5">
          {/* Date picker */}
          <DoctorDatePicker value={selectedDate} onChange={setSelectedDate} />
          {/* Time picker */}
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className={cn(chipSelectClass, "w-[6.5rem]")}
            title="Время визита"
          />
          {/* Branch / location */}
          {locationOptions.length > 0 && !locationOther ? (
            <Select
              value={location}
              onValueChange={(v) => {
                if (v === "__other__") { setLocationOther(true); setLocation(""); }
                else {
                  setLocation(v ?? "");
                  // When branch changes, reset service if it's no longer available
                  setService("");
                  setServiceOther(false);
                }
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
          {/* Service — filtered by selected branch */}
          {servicesForCurrentBranch.length > 0 && !serviceOther ? (
            <Select
              value={service}
              onValueChange={(v) => {
                if (v === "__other__") { setServiceOther(true); setService(""); }
                else setService(v ?? "");
              }}
            >
              <SelectTrigger
                displayLabel={service || "— услуга —"}
                className="h-[26px] min-w-[7rem] px-2 text-xs"
              />
              <SelectContent>
                <SelectItem value="">— услуга —</SelectItem>
                {servicesForCurrentBranch.map((o) => <SelectItem key={o.id} value={o.title}>{o.title}</SelectItem>)}
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
          {/* Calendar icon — shows source appointment info when present */}
          {sourceAppointment && (
            <button
              type="button"
              onClick={() => setBookingInfoOpen(true)}
              title="Информация о записи"
              className="flex-none rounded-md border border-border bg-background px-1.5 py-1 text-sm hover:bg-primary/10"
              aria-label="Просмотр записи"
            >
              📅
            </button>
          )}
        </span>
      </div>

      {/* Hint: source booking label */}
      {sourceAppointment ? (
        <p className={cn(hintClass, "border-b border-border px-3.5 py-1.5")}>
          Визит создаётся из записи{sourceAppointment.dateTime
            ? ` от ${new Date(sourceAppointment.dateTime).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}`
            : ""}
          {" "}· нажмите 📅 для просмотра деталей записи
        </p>
      ) : (
        <p className={cn(hintClass, "border-b border-border px-3.5 py-1.5")}>
          Визит без привязки к записи на приём
        </p>
      )}

      {/* body */}
      <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {visitType === "first" ? (
          <>
            {/* Жалобы */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={fieldLabelClass}>Симптомы</span>
                <button
                  type="button"
                  onClick={addFirstComplaint}
                  title="Добавить симптом"
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
                      placeholder="Описание симптома…"
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
                ⚑ — приоритет · 0–10 — выраженность
              </p>
            </div>

            <FormTextarea
              label="Осмотр"
              placeholder="Данные объективного осмотра…"
              minH="min-h-[54px]"
              value={examFirst}
              onChange={setExamFirst}
            />

            {/* Предварительный диагноз */}
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
                <DiagnosisAutocomplete userId={userId} onSelect={addFirstDiagnosis} />
              </div>
              <p className={hintClass}>
                Автокомплит по справочнику, «+ Создать» — добавляет в общий справочник
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
            {/* Динамика симптомов */}
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Динамика симптомов</span>
              {activeComplaints.length === 0 && (
                <p className={hintClass}>Нет активных симптомов — добавьте через первичный визит.</p>
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
                        placeholder="Динамика симптома…"
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

            {/* Уточнение диагноза */}
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Уточнение диагноза</span>
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
                        placeholder="Уточнение..."
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
              Ручное сохранение
            </span>
          )}
        </div>
      </div>

      {/* Close-with-unsaved-changes confirm */}
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
              Вернуться
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

      {/* Booking info modal (calendar icon click) */}
      {sourceAppointment && (
        <BookingInfoModal
          appointment={sourceAppointment}
          open={bookingInfoOpen}
          onClose={() => setBookingInfoOpen(false)}
        />
      )}
    </div>
  );
}
