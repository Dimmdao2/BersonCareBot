'use client';

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
 * Changes from prior version (#511):
 *   - Duration is stored again and auto-filled from booking/service catalog.
 *   - Branch dropdown now filters services by location (booking-engine locationAvailability).
 *   - Calendar icon (📅) appears next to branch/service when a source appointment is linked;
 *     clicking it shows a read-only mini-modal with appointment details.
 *   - canonical appointment id sent on save when created from a booking.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  DiagnosisCatalogSuggestion,
} from '@/modules/patient-clinical/ports';
import type { PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import { cn } from '@/lib/utils';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import { VisitCatalogTextarea } from './VisitCatalogTextarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisitType = 'first' | 'repeat';

type FormComplaintEntry = {
  id: string;
  priority: boolean;
  text: string;
  description: string;
  severity: number;
};

type FormDiagnosisEntry = {
  id: string;
  priority: boolean;
  text: string;
  catalogId: string | null;
  comment: string;
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
  durationMinutes: number | null;
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const fieldLabelClass = 'text-xs font-semibold text-foreground';
const hintClass = 'text-xs text-muted-foreground';
const ONLINE_LOCATION = 'Онлайн';

type LocationSourceAppointment = {
  location?: string;
  branchName?: string;
};

type LocationSourceBranch = {
  title: string;
  shortTitle: string | null;
  isActive: boolean;
};

export function buildVisitLocationOptions(
  appointments: LocationSourceAppointment[],
  branches: LocationSourceBranch[],
): string[] {
  const catalogLocations = branches
    .filter((b) => b.isActive)
    .flatMap((b) => [b.title, b.shortTitle ?? ''])
    .filter(Boolean);
  const appointmentLocations = appointments
    .map((a) => a.branchName ?? a.location ?? '')
    .filter(Boolean);
  return Array.from(new Set([...catalogLocations, ...appointmentLocations, ONLINE_LOCATION]));
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function PriorityFlag({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      onClick={onToggle}
      title={on ? 'Приоритет: вкл' : 'Приоритет: выкл'}
      variant="ghost"
      size="icon-xs"
      className={cn(
        'flex-none text-sm leading-none',
        on ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      ⚑
    </Button>
  );
}

function FormTextarea({
  label,
  placeholder,
  minH = 'min-h-[38px]',
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
      <Textarea
        className={cn(minH)}
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
  const [draft, setDraft] = useState('');
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
        .then(
          (r) => r.json() as Promise<{ ok: boolean; suggestions: DiagnosisCatalogSuggestion[] }>,
        )
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
      comment: '',
    });
    setDraft('');
    setSuggestions([]);
  };

  const handleCreate = async () => {
    const label = draft.trim();
    if (!label) return;
    try {
      const r = await fetch(`/api/doctor/patients/${userId}/diagnosis-catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = (await r.json()) as { ok: boolean; entry: DiagnosisCatalogSuggestion };
      onSelect({
        id: `fd${Date.now()}`,
        priority: false,
        text: data.entry.label,
        catalogId: data.entry.id,
        comment: '',
      });
      setDraft('');
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
        <Input
          type="search"
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Начните вводить — поиск по справочнику..."
          autoComplete="off"
          className="flex-1 rounded-t-lg"
        />
        <Button
          type="button"
          onClick={() => {
            setDraft('');
            setSuggestions([]);
          }}
          variant="ghost"
          size="icon-xs"
          className="flex-none text-sm text-muted-foreground"
        >
          ✕
        </Button>
      </div>
      {showDropdown && (
        <div className="mx-[19px] overflow-hidden rounded-b-lg border border-t-0 border-primary bg-background text-sm">
          {loading && (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground animate-pulse">Поиск…</div>
          )}
          {!loading &&
            suggestions.map((s, idx) => (
              <Button
                type="button"
                key={s.id}
                onClick={() => handleSelect(s)}
                variant="ghost"
                className={cn(
                  'flex w-full items-center gap-1 px-2.5 py-1.5 text-left h-auto rounded-none hover:bg-primary/10',
                  idx === 0 && 'bg-primary/10',
                  idx > 0 && 'border-t border-border',
                )}
              >
                <span className="font-semibold text-foreground">{s.label}</span>
                {s.note && <span className={hintClass}>· {s.note}</span>}
              </Button>
            ))}
          <Button
            type="button"
            onClick={handleCreate}
            variant="ghost"
            className="flex w-full items-center px-2.5 py-1.5 text-left h-auto rounded-none font-medium text-primary hover:bg-primary/10 border-t border-border"
          >
            + Создать в справочнике: «{draft}»
          </Button>
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
    ? new Date(appointment.dateTime).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  const statusLabel: Record<string, string> = {
    upcoming: 'Предстоящая',
    completed: 'Состоялась',
    rescheduled: 'Перенесена',
    canceled: 'Отменена',
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
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
                <span className="break-all font-mono text-xs text-muted-foreground">
                  {appointment.id}
                </span>
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onClose} variant="outline" size="sm" className="text-xs">
            Закрыть
          </Button>
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
   * When saving: canonicalAppointmentId carries the canonical internal id.
   */
  sourceAppointment?: PatientAppointmentItem | null;
  /** Called once after this component captures pending props into state. */
  onPendingConsumed?: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [visitType, setVisitType] = useState<VisitType>('repeat');

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
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String((Math.round(now.getMinutes() / 5) * 5) % 60).padStart(2, '0');
    return `${h}:${m}`;
  });

  useEffect(() => {
    if (pendingVisitDate) {
      setSelectedDate(pendingVisitDate);
    }
  }, [pendingVisitDate]);

  const [location, setLocation] = useState(() => pendingLocation ?? '');
  const [service, setService] = useState(() => pendingService ?? '');
  const [duration, setDuration] = useState(() =>
    sourceAppointment?.durationMin ? String(sourceAppointment.durationMin) : '',
  );
  const initialHeaderRef = useRef({ selectedDate, selectedTime, location, service, duration });

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
    if (sourceAppointment?.durationMin) setDuration(String(sourceAppointment.durationMin));
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
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              appointments?: Array<{
                location?: string;
                branchName?: string;
                serviceName?: string;
              }>;
            }>)
          : null,
      )
      .catch(() => null);

    const servicesFetch = fetch(`/api/doctor/booking-engine/services`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              ok: boolean;
              services?: Array<{
                id: string;
                title: string;
                isActive: boolean;
                durationMinutes?: number | null;
              }>;
              locationAvailability?: Array<{
                serviceId: string;
                branchId: string;
                isActive: boolean;
              }>;
            }>)
          : null,
      )
      .catch(() => null);

    // Fetch branches to build name→id map
    const overviewFetch = fetch(`/api/doctor/booking-engine/overview`)
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{
              ok: boolean;
              branches?: Array<{
                id: string;
                title: string;
                shortTitle: string | null;
                isActive: boolean;
              }>;
            }>)
          : null,
      )
      .catch(() => null);

    void Promise.all([apptsFetch, servicesFetch, overviewFetch]).then(
      ([apptData, servicesData, overviewData]) => {
        const appts = apptData?.appointments ?? [];

        const uniqueLocations = buildVisitLocationOptions(appts, overviewData?.branches ?? []);
        setLocationOptions(uniqueLocations);

        setAllServices(
          (servicesData?.services ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            isActive: s.isActive,
            durationMinutes: s.durationMinutes ?? null,
          })),
        );
        setLocationAvailability(servicesData?.locationAvailability ?? []);

        // Build branch name → id map from overview
        const nameToId: Record<string, string> = {};
        for (const b of overviewData?.branches ?? []) {
          nameToId[b.title] = b.id;
          if (b.shortTitle) nameToId[b.shortTitle] = b.id;
        }
        setBranchNameToId(nameToId);

        // Pre-fill location from the most recent appointment (if not already set from source)
        const latest = appts[0];
        if (latest) {
          if (!snapshotLocation && (latest.branchName ?? latest.location)) {
            setLocation(latest.branchName ?? latest.location ?? '');
          }
          if (!snapshotService && latest.serviceName) setService(latest.serviceName);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!service || serviceOther) return;
    const selected = allServices.find((s) => s.title === service);
    if (selected?.durationMinutes) {
      setDuration(String(selected.durationMinutes));
    }
  }, [allServices, service, serviceOther]);

  // ── Draft persistence (#205) ───────────────────────────────────────────────
  const draftKey = `nvp_draft_${userId}`;

  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // ── FIRST VISIT state ─────────────────────────────────────────────────────
  const [firstComplaints, setFirstComplaints] = useState<FormComplaintEntry[]>([
    { id: 'fc_init', priority: false, text: '', description: '', severity: 0 },
  ]);
  const [firstDiagnoses, setFirstDiagnoses] = useState<FormDiagnosisEntry[]>([]);

  const [anamnesisText, setAnamnesisText] = useState('');
  const [examFirst, setExamFirst] = useState('');
  const [manipulationsFirst, setManipulationsFirst] = useState('');
  const [trialResultsFirst, setTrialResultsFirst] = useState('');
  const [recommendationsFirst, setRecommendationsFirst] = useState('');

  // ── REPEAT VISIT state ────────────────────────────────────────────────────
  const [complaintUpdates, setComplaintUpdates] = useState<Record<string, RepeatComplaintUpdate>>(
    () =>
      Object.fromEntries(
        activeComplaints.map((c) => [
          c.id,
          { complaintId: c.id, note: '', severity: c.currentSeverity, resolved: false },
        ]),
      ),
  );

  const [diagnosisUpdates, setDiagnosisUpdates] = useState<Record<string, RepeatDiagnosisUpdate>>(
    () =>
      Object.fromEntries(
        activeDiagnoses.map((d) => [d.id, { diagnosisId: d.id, refinement: '', removed: false }]),
      ),
  );

  const [examRepeat, setExamRepeat] = useState('');
  const [manipulationsRepeat, setManipulationsRepeat] = useState('');
  const [recommendationsRepeat, setRecommendationsRepeat] = useState('');

  const restoredComplaintDraftRef = useRef(false);
  const restoredDiagnosisDraftRef = useRef(false);

  useEffect(() => {
    if (restoredComplaintDraftRef.current) {
      restoredComplaintDraftRef.current = false;
      return;
    }
    setComplaintUpdates(
      Object.fromEntries(
        activeComplaints.map((c) => [
          c.id,
          { complaintId: c.id, note: '', severity: c.currentSeverity, resolved: false },
        ]),
      ),
    );
  }, [activeComplaints]);

  useEffect(() => {
    if (restoredDiagnosisDraftRef.current) {
      restoredDiagnosisDraftRef.current = false;
      return;
    }
    setDiagnosisUpdates(
      Object.fromEntries(
        activeDiagnoses.map((d) => [d.id, { diagnosisId: d.id, refinement: '', removed: false }]),
      ),
    );
  }, [activeDiagnoses]);

  useEffect(() => {
    if (activeComplaints.length === 0 && activeDiagnoses.length === 0) {
      setVisitType('first');
    } else {
      setVisitType('repeat');
    }
  }, [activeComplaints, activeDiagnoses]);

  // ── Draft persistence + isDirty (#205) ────────────────────────────────────

  type VisitDraft = {
    visitType: VisitType;
    selectedDate: string;
    selectedTime: string;
    location: string;
    service: string;
    duration: string;
    locationOther: boolean;
    serviceOther: boolean;
    firstComplaints: FormComplaintEntry[];
    firstDiagnoses: FormDiagnosisEntry[];
    complaintUpdates: Record<string, RepeatComplaintUpdate>;
    diagnosisUpdates: Record<string, RepeatDiagnosisUpdate>;
    anamnesisText: string;
    examFirst: string;
    manipulationsFirst: string;
    trialResultsFirst: string;
    recommendationsFirst: string;
    examRepeat: string;
    manipulationsRepeat: string;
    recommendationsRepeat: string;
  };

  const headerDirty =
    selectedDate !== initialHeaderRef.current.selectedDate ||
    selectedTime !== initialHeaderRef.current.selectedTime ||
    location !== initialHeaderRef.current.location ||
    service !== initialHeaderRef.current.service ||
    duration !== initialHeaderRef.current.duration;

  const isDirty =
    headerDirty ||
    anamnesisText.trim() !== '' ||
    examFirst.trim() !== '' ||
    manipulationsFirst.trim() !== '' ||
    trialResultsFirst.trim() !== '' ||
    recommendationsFirst.trim() !== '' ||
    examRepeat.trim() !== '' ||
    manipulationsRepeat.trim() !== '' ||
    recommendationsRepeat.trim() !== '' ||
    firstComplaints.some(
      (c) => c.text.trim() !== '' || c.description.trim() !== '' || c.priority || c.severity !== 0,
    ) ||
    firstDiagnoses.length > 0 ||
    Object.values(complaintUpdates).some(
      (u) =>
        u.note.trim() !== '' ||
        u.resolved ||
        u.severity !==
          (activeComplaints.find((c) => c.id === u.complaintId)?.currentSeverity ?? u.severity),
    ) ||
    Object.values(diagnosisUpdates).some((u) => u.refinement.trim() !== '' || u.removed);

  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    if (pendingVisitDate ?? pendingLocation ?? pendingService) return;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null;
      if (!raw) return;
      const d = JSON.parse(raw) as VisitDraft;
      if (d.visitType) setVisitType(d.visitType);
      if (d.selectedDate) setSelectedDate(d.selectedDate);
      if (d.selectedTime) setSelectedTime(d.selectedTime);
      if (d.location !== undefined) setLocation(d.location);
      if (d.service !== undefined) setService(d.service);
      if (d.duration) setDuration(d.duration);
      if (d.locationOther !== undefined) setLocationOther(d.locationOther);
      if (d.serviceOther !== undefined) setServiceOther(d.serviceOther);
      if (Array.isArray(d.firstComplaints) && d.firstComplaints.length > 0) {
        setFirstComplaints(d.firstComplaints);
      }
      if (Array.isArray(d.firstDiagnoses)) setFirstDiagnoses(d.firstDiagnoses);
      if (d.complaintUpdates) {
        setComplaintUpdates(d.complaintUpdates);
        restoredComplaintDraftRef.current = true;
      }
      if (d.diagnosisUpdates) {
        setDiagnosisUpdates(d.diagnosisUpdates);
        restoredDiagnosisDraftRef.current = true;
      }
      if (d.anamnesisText) setAnamnesisText(d.anamnesisText);
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
        selectedDate,
        selectedTime,
        location,
        service,
        duration,
        locationOther,
        serviceOther,
        firstComplaints,
        firstDiagnoses,
        complaintUpdates,
        diagnosisUpdates,
        anamnesisText,
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
    selectedDate,
    selectedTime,
    location,
    service,
    duration,
    locationOther,
    serviceOther,
    firstComplaints,
    firstDiagnoses,
    complaintUpdates,
    diagnosisUpdates,
    anamnesisText,
    examFirst,
    manipulationsFirst,
    trialResultsFirst,
    recommendationsFirst,
    examRepeat,
    manipulationsRepeat,
    recommendationsRepeat,
  ]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null);

    // Client-side validation — required fields
    const missing: string[] = [];
    if (!location.trim()) missing.push('Место приёма');
    if (!service.trim()) missing.push('Услуга');
    if (missing.length > 0) {
      setSaveError(`Заполните обязательные поля: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);

    const visitedAt = `${selectedDate}T${selectedTime}:00`;

    const body: Record<string, unknown> = {
      visitType,
      date: visitedAt,
      location: location.trim() || undefined,
      service: service.trim() || undefined,
      duration: duration.trim() || undefined,
      anamnesisText: anamnesisText.trim() || undefined,
      ...(sourceAppointment?.internalId
        ? { canonicalAppointmentId: sourceAppointment.internalId }
        : {}),
    };

    if (visitType === 'first') {
      const validComplaints = firstComplaints.filter((c) => c.text.trim());
      if (validComplaints.length > 0) {
        body.complaints = validComplaints.map((c) => ({
          text: c.text,
          description: c.description.trim() || undefined,
          priority: c.priority,
          severity: c.severity,
        }));
      }
      const validDiagnoses = firstDiagnoses.filter((d) => d.text.trim());
      if (validDiagnoses.length > 0) {
        body.diagnoses = validDiagnoses.map((d) => ({
          text: d.text,
          priority: d.priority,
          comment: d.comment.trim() || undefined,
          ...(d.catalogId ? { catalogId: d.catalogId } : {}),
        }));
      }
      if (examFirst.trim()) body.exam = examFirst;
      if (manipulationsFirst.trim()) body.manipulations = manipulationsFirst;
      if (trialResultsFirst.trim()) body.trialResults = trialResultsFirst;
      if (recommendationsFirst.trim()) body.recommendations = recommendationsFirst;
    } else {
      const cuList = Object.values(complaintUpdates)
        .filter(
          (u) =>
            u.note.trim() ||
            u.resolved ||
            u.severity !==
              (activeComplaints.find((c) => c.id === u.complaintId)?.currentSeverity ?? u.severity),
        )
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`status ${r.status}${text ? `: ${text}` : ''}`);
      }
      clearDraft();
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  // ── Add rows helpers (first visit) ────────────────────────────────────────
  const addFirstComplaint = () =>
    setFirstComplaints((prev) => [
      ...prev,
      { id: `fc${Date.now()}`, priority: false, text: '', description: '', severity: 0 },
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
          {(['first', 'repeat'] as const).map((vt) => (
            <Button
              key={vt}
              type="button"
              onClick={() => setVisitType(vt)}
              size="xs"
              variant={visitType === vt ? 'default' : 'ghost'}
              className={cn(
                'text-xs',
                visitType !== vt && 'text-muted-foreground hover:text-foreground',
              )}
            >
              {vt === 'first' ? 'Первичный' : 'Повторный'}
            </Button>
          ))}
        </span>
        <Button
          type="button"
          onClick={() => {
            if (isDirty) {
              setCloseConfirmOpen(true);
              return;
            }
            onClose();
          }}
          title="Закрыть"
          variant="outline"
          size="xs"
          className="order-last ml-auto text-xs text-muted-foreground"
        >
          ✕
        </Button>
        <span className="flex flex-wrap items-center gap-1.5">
          {/* Date picker */}
          <DoctorDatePicker value={selectedDate} onChange={setSelectedDate} />
          {/* Time picker */}
          <Input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-[6.5rem] h-[26px] px-2 text-xs"
            title="Время визита"
          />
          {/* Branch / location */}
          {locationOptions.length > 0 && !locationOther ? (
            <Select
              value={location}
              onValueChange={(v) => {
                if (v === '__other__') {
                  setLocationOther(true);
                  setLocation('');
                } else {
                  setLocation(v ?? '');
                  // When branch changes, reset service if it's no longer available
                  setService('');
                  setServiceOther(false);
                }
              }}
            >
              <SelectTrigger className="h-[26px] min-w-[7.5rem] px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— место приёма —</SelectItem>
                {locationOptions.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
                <SelectItem value="__other__">Другое...</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Место приёма"
              className="w-32 h-[26px] px-2 text-xs"
            />
          )}
          {/* Service — filtered by selected branch */}
          {servicesForCurrentBranch.length > 0 && !serviceOther ? (
            <Select
              value={service}
              onValueChange={(v) => {
                if (v === '__other__') {
                  setServiceOther(true);
                  setService('');
                } else {
                  const next = v ?? '';
                  setService(next);
                  const selected = allServices.find((s) => s.title === next);
                  if (selected?.durationMinutes) setDuration(String(selected.durationMinutes));
                }
              }}
            >
              <SelectTrigger className="h-[26px] min-w-[7rem] px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— услуга —</SelectItem>
                {servicesForCurrentBranch.map((o) => (
                  <SelectItem key={o.id} value={o.title}>
                    {o.title}
                  </SelectItem>
                ))}
                <SelectItem value="__other__">Другое...</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="Услуга"
              className="w-28 h-[26px] px-2 text-xs"
            />
          )}
          <Input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Мин"
            className="w-16 h-[26px] px-2 text-xs"
            title="Длительность, минут"
          />
          {/* Calendar icon — shows source appointment info when present */}
          {sourceAppointment && (
            <Button
              type="button"
              onClick={() => setBookingInfoOpen(true)}
              title="Информация о записи"
              variant="outline"
              size="xs"
              className="flex-none text-sm"
              aria-label="Просмотр записи"
            >
              📅
            </Button>
          )}
        </span>
      </div>

      {/* Hint: source booking label */}
      {sourceAppointment ? (
        <p className={cn(hintClass, 'border-b border-border px-3.5 py-1.5')}>
          Визит создаётся из записи
          {sourceAppointment.dateTime
            ? ` от ${new Date(sourceAppointment.dateTime).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}`
            : ''}{' '}
          · нажмите 📅 для просмотра деталей записи
        </p>
      ) : (
        <p className={cn(hintClass, 'border-b border-border px-3.5 py-1.5')}>
          Визит без привязки к записи на приём
        </p>
      )}

      {/* body */}
      <div className="flex flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <FormTextarea
          label="Анамнез / история появления жалобы"
          placeholder="Когда и как появилась жалоба, что предшествовало, как менялась…"
          minH="min-h-[54px]"
          value={anamnesisText}
          onChange={setAnamnesisText}
        />

        {visitType === 'first' ? (
          <>
            {/* Жалобы */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={fieldLabelClass}>Симптомы</span>
                <Button
                  type="button"
                  onClick={addFirstComplaint}
                  title="Добавить симптом"
                  variant="ghost"
                  size="icon-xs"
                  className="grid h-[17px] w-[17px] place-items-center rounded-md border border-primary/40 text-xs text-primary"
                >
                  +
                </Button>
              </div>
              <div className="flex flex-col gap-1.5">
                {firstComplaints.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/10 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <PriorityFlag
                        on={c.priority}
                        onToggle={() =>
                          setFirstComplaints((prev) =>
                            prev.map((x) => (x.id === c.id ? { ...x, priority: !x.priority } : x)),
                          )
                        }
                      />
                      <Input
                        value={c.text}
                        onChange={(e) =>
                          setFirstComplaints((prev) =>
                            prev.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)),
                          )
                        }
                        placeholder="Симптом…"
                        className="flex-1"
                      />
                      <span className="flex flex-none items-center gap-1 text-xs text-muted-foreground">
                        <Input
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
                          className="w-11 px-1 text-center"
                        />
                        /10
                      </span>
                      {firstComplaints.length > 1 && (
                        <Button
                          type="button"
                          onClick={() =>
                            setFirstComplaints((prev) => prev.filter((x) => x.id !== c.id))
                          }
                          title="Удалить"
                          variant="ghost"
                          size="icon-xs"
                          className="flex-none text-sm text-muted-foreground hover:text-destructive"
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                    <Textarea
                      value={c.description}
                      onChange={(e) =>
                        setFirstComplaints((prev) =>
                          prev.map((x) =>
                            x.id === c.id ? { ...x, description: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="Описание под симптомом…"
                      className="min-h-[40px]"
                    />
                  </div>
                ))}
              </div>
              <p className={hintClass}>⚑ — приоритет · 0–10 — выраженность</p>
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
                  <div
                    key={d.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/10 p-2"
                  >
                    <div className="flex items-center gap-2">
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
                      <Button
                        type="button"
                        onClick={() =>
                          setFirstDiagnoses((prev) => prev.filter((x) => x.id !== d.id))
                        }
                        title="Удалить"
                        variant="ghost"
                        size="icon-xs"
                        className="flex-none text-sm text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </Button>
                    </div>
                    <Textarea
                      value={d.comment}
                      onChange={(e) =>
                        setFirstDiagnoses((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, comment: e.target.value } : x)),
                        )
                      }
                      placeholder="Комментарий под диагнозом: сторона, уровень, уточнение…"
                      className="min-h-[40px]"
                    />
                  </div>
                ))}
                <DiagnosisAutocomplete userId={userId} onSelect={addFirstDiagnosis} />
              </div>
              <p className={hintClass}>
                Автокомплит по справочнику, «+ Создать» — добавляет в общий справочник
              </p>
            </div>

            <VisitCatalogTextarea
              label="Проведённые манипуляции"
              placeholder="Проведённые манипуляции…"
              value={manipulationsFirst}
              onChange={setManipulationsFirst}
              catalog="manipulations"
            />
            <FormTextarea
              label="Результаты пробного лечения"
              placeholder="Динамика / результат…"
              value={trialResultsFirst}
              onChange={setTrialResultsFirst}
            />
            <VisitCatalogTextarea
              label="Рекомендации / Назначения"
              placeholder="Рекомендации / назначения…"
              value={recommendationsFirst}
              onChange={setRecommendationsFirst}
              catalog="recommendations"
            />
          </>
        ) : (
          <>
            {/* Динамика симптомов */}
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Динамика симптомов</span>
              {activeComplaints.length === 0 && (
                <p className={hintClass}>
                  Нет активных симптомов — добавьте через первичный визит.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {activeComplaints.map((c) => {
                  const upd = complaintUpdates[c.id] ?? {
                    complaintId: c.id,
                    note: '',
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
                      <Textarea
                        className="mt-1.5 min-h-[40px]"
                        placeholder="Динамика симптома…"
                        value={upd.note}
                        onChange={(e) => setUpd({ note: e.target.value })}
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          Выраженность: <span>было {c.currentSeverity}/10</span> →
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            value={upd.severity}
                            onChange={(e) => setUpd({ severity: Number(e.target.value) })}
                            className="w-11 px-1 text-center"
                          />
                          /10
                        </span>
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={upd.resolved}
                            onCheckedChange={(checked) => setUpd({ resolved: checked === true })}
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
                <p className={hintClass}>
                  Нет активных диагнозов — добавьте через первичный визит.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {activeDiagnoses.map((d) => {
                  const upd = diagnosisUpdates[d.id] ?? {
                    diagnosisId: d.id,
                    refinement: '',
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
                      <Input
                        value={upd.refinement}
                        onChange={(e) => setUpd({ refinement: e.target.value })}
                        placeholder="Уточнение..."
                        className="mt-1.5 w-full"
                      />
                      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={upd.removed}
                          onCheckedChange={(checked) => setUpd({ removed: checked === true })}
                        />
                        Снять диагноз
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <VisitCatalogTextarea
              label="Проведённые манипуляции"
              placeholder="Проведённые манипуляции…"
              value={manipulationsRepeat}
              onChange={setManipulationsRepeat}
              catalog="manipulations"
            />
            <VisitCatalogTextarea
              label="Рекомендации / Назначения — коррекция"
              placeholder="Рекомендации / назначения…"
              value={recommendationsRepeat}
              onChange={setRecommendationsRepeat}
              catalog="recommendations"
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
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="text-xs"
          >
            {saving ? 'Сохранение…' : 'Сохранить визит'}
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-xs">
            Прикрепить файлы
          </Button>
          {!saveError && <span className={cn(hintClass, 'ml-auto')}>Ручное сохранение</span>}
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
            <Button
              type="button"
              onClick={() => setCloseConfirmOpen(false)}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Вернуться
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCloseConfirmOpen(false);
                onClose();
              }}
              size="sm"
              className="text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Закрыть без сохранения
            </Button>
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
