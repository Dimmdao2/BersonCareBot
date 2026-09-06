'use client';

/**
 * EncounterPageClient — полноценная страница приёма (P4.5/P4.6).
 *
 * Reuse map (ENCOUNTER-PAGE-02, «Один общий проход»):
 *   - Visit write path:       POST/PATCH /api/doctor/patients/[userId]/visits[/[visitId]].
 *   - Symptom/diagnosis forms: POST /api/doctor/patients/[userId]/complaints|diagnoses
 *                              (те же эндпойнты, что PatientClinicalSections.tsx).
 *   - Appointment form:        каноническая `DoctorAppointmentForm` (calendar) + тот же
 *                              `POST /api/doctor/booking-engine/appointments/manual`, которым
 *                              пользуется `DoctorCalendarEventPanel`/`DoctorNewAppointmentModal`.
 *   - Unlinked appointments:   GET /api/doctor/patients/[userId]/appointments/unlinked.
 *
 *   - Overlap retry:           the first canonical manual request remains fail-closed; a 409
 *                              `slot_overlap` opens the shared confirmation and retries that
 *                              exact request with staff-only `allowOverlap: true`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  ClinicalState,
  CreateVisitComplaint,
  CreateVisitComplaintUpdate,
  CreateVisitDiagnosis,
  CreateVisitDiagnosisUpdate,
  UpdateVisitFieldsInput,
  Visit,
} from '@/modules/patient-clinical/ports';
import type { PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import type {
  CalendarFilterMeta,
  CalendarServiceFilterOption,
} from '@/modules/booking-calendar/types';
import {
  resolveCalendarCreateSubmission,
  type CalendarCreateActiveFilters,
} from '@/modules/booking-calendar/calendarCreateFieldMode';
import type { DoctorScheduleSpecialistOption } from '@/modules/doctor-schedule/scope';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorModal, DoctorModalFooter } from '@/shared/ui/doctor/DoctorModal';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import { DoctorDateTimePicker } from '@/shared/ui/doctor/DoctorDateTimePicker';
import { patientCardHref } from '../../patientCardHref';
import { PatientClinicalCreateModal } from '../tabs/karta/PatientClinicalSections';
import { VisitCatalogTextarea } from './VisitCatalogTextarea';
import {
  DiagnosisAutocomplete,
  FormTextarea,
  PriorityFlag,
  type FormComplaintEntry,
  type FormDiagnosisEntry,
} from './EncounterFormFields';
import {
  DoctorAppointmentForm,
  type AppointmentFormDraft,
  type AppointmentStatusOption,
} from '../../../calendar/DoctorAppointmentForm';
import {
  type AppointmentFinancialRequestFields,
  AppointmentFormFinancialsError,
  appointmentFinancialRequestFields,
} from '../../../calendar/appointmentFormFinancials';

const BOOKING_API_BASE = '/api/doctor/booking-engine';
const fieldLabelClass = 'text-sm font-semibold text-foreground';
const hintClass = 'text-xs text-muted-foreground';

type PatientContext = {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

type Props = {
  mode: 'create' | 'edit';
  userId: string;
  patient: PatientContext;
  ownSpecialistId: string | null;
  /** Canonical appointment id — задан только когда страница открыта из деталей записи. */
  boundAppointmentId: string | null;
  /** Только для mode="edit": визит, загруженный сервером. */
  initialVisit?: Visit;
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

type ClinicalApiResponse = { ok: boolean; state: ClinicalState; visits: Visit[] };
type AppointmentsApiResponse = { appointments: PatientAppointmentItem[] };
type UnlinkedApiResponse = { ok: boolean; appointments: PatientAppointmentItem[] };
type CalendarApiResponse = {
  ok: boolean;
  filters?: CalendarFilterMeta;
  resolvedScope?: { ownSpecialistId: string | null; specialists: DoctorScheduleSpecialistOption[] };
  timeZone?: string;
};

type CreateVisitRequest = {
  visitType: 'first' | 'repeat';
  date: string;
  location?: string;
  service?: string;
  duration?: string;
  anamnesisText?: string;
  canonicalAppointmentId?: string;
  exam?: string;
  manipulations?: string;
  trialResults?: string;
  recommendations?: string;
  complaints?: CreateVisitComplaint[];
  diagnoses?: CreateVisitDiagnosis[];
  complaintUpdates?: CreateVisitComplaintUpdate[];
  diagnosisUpdates?: CreateVisitDiagnosisUpdate[];
};

type UpdateVisitRequest = Omit<UpdateVisitFieldsInput, 'patientUserId' | 'visitId'>;

const EMPTY_FILTER_META: CalendarFilterMeta = { specialists: [], branches: [], rooms: [], services: [] };

const EMPTY_APPOINTMENT_DRAFT: AppointmentFormDraft = {
  start: '',
  durationMinutes: null,
  specialistId: null,
  branchId: null,
  serviceId: null,
  patient: null,
  comment: '',
  status: null,
  priceRubles: '',
  priceOverridden: false,
  prepayment: null,
  prepaymentOverridden: false,
};

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIsoDate(): string {
  return toIsoDate(new Date());
}

function nowHm(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String((Math.round(now.getMinutes() / 5) * 5) % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function appointmentSummaryLine(appointment: PatientAppointmentItem): string {
  const dt = appointment.dateTime
    ? new Date(appointment.dateTime).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
  const parts = [
    dt,
    appointment.location,
    appointment.specialistName,
    appointment.serviceName,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function EncounterPageClient({
  mode,
  userId,
  patient,
  ownSpecialistId,
  boundAppointmentId,
  initialVisit,
}: Props) {
  const router = useRouter();

  // ── Clinical state (симптомы/диагнозы/история визитов) ───────────────────
  const [clinicalLoading, setClinicalLoading] = useState(true);
  const [clinicalError, setClinicalError] = useState(false);
  const [clinicalState, setClinicalState] = useState<ClinicalState | null>(null);

  const reloadClinical = useCallback(() => {
    setClinicalError(false);
    fetch(`/api/doctor/patients/${userId}/clinical`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<ClinicalApiResponse>;
      })
      .then((data) => {
        setClinicalState(data.state);
      })
      .catch(() => setClinicalError(true))
      .finally(() => setClinicalLoading(false));
  }, [userId]);

  useEffect(() => {
    reloadClinical();
  }, [reloadClinical]);

  const activeComplaints: ActiveComplaint[] = useMemo(
    () => clinicalState?.complaints ?? [],
    [clinicalState],
  );
  const activeDiagnoses: ActiveDiagnosis[] = useMemo(
    () => clinicalState?.diagnoses ?? [],
    [clinicalState],
  );

  // ── Тип приёма (создание) ──────────────────────────────────────────────
  const [visitType, setVisitType] = useState<'first' | 'repeat'>(
    mode === 'edit' ? (initialVisit?.type ?? 'repeat') : 'repeat',
  );
  useEffect(() => {
    if (mode !== 'create') return;
    if (activeComplaints.length === 0 && activeDiagnoses.length === 0) setVisitType('first');
    else setVisitType('repeat');
  }, [mode, activeComplaints, activeDiagnoses]);

  // ── Связь с записью (создание) ────────────────────────────────────────
  const [boundAppointment, setBoundAppointment] = useState<PatientAppointmentItem | null>(null);
  const [unlinkedAppointments, setUnlinkedAppointments] = useState<PatientAppointmentItem[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(
    mode === 'create' || Boolean(initialVisit?.canonicalAppointmentId),
  );
  const [selectedUnlinkedId, setSelectedUnlinkedId] = useState<string>('');
  // ENCOUNTER-APPOINTMENT-03: без выбранной записи флажок «Создать запись» включён по умолчанию.
  const [createAppointmentEnabled, setCreateAppointmentEnabled] = useState(true);

  const appointmentIdToLoad = boundAppointmentId ?? initialVisit?.canonicalAppointmentId ?? null;

  useEffect(() => {
    let cancelled = false;
    if (appointmentIdToLoad) {
      // ENCOUNTER-APPOINTMENT-01: связь задана заранее, повторно не выбирается.
      fetch(`/api/doctor/patients/${userId}/appointments`, { credentials: 'include' })
        .then((r) => (r.ok ? (r.json() as Promise<AppointmentsApiResponse>) : null))
        .then((data) => {
          if (cancelled) return;
          const found =
            data?.appointments.find((a) => a.internalId === appointmentIdToLoad) ?? null;
          setBoundAppointment(found);
        })
        .catch(() => {
          if (!cancelled) setBoundAppointment(null);
        })
        .finally(() => {
          if (!cancelled) setAppointmentsLoading(false);
        });
    } else if (mode === 'create') {
      // ENCOUNTER-APPOINTMENT-02: выбор уже существующей ещё не связанной записи.
      fetch(`/api/doctor/patients/${userId}/appointments/unlinked`, { credentials: 'include' })
        .then((r) => (r.ok ? (r.json() as Promise<UnlinkedApiResponse>) : null))
        .then((data) => {
          if (cancelled) return;
          setUnlinkedAppointments(data?.appointments ?? []);
        })
        .catch(() => {
          if (!cancelled) setUnlinkedAppointments([]);
        })
        .finally(() => {
          if (!cancelled) setAppointmentsLoading(false);
        });
    } else {
      setAppointmentsLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [mode, userId, appointmentIdToLoad]);

  const effectiveBoundAppointment: PatientAppointmentItem | null =
    boundAppointment ??
    (selectedUnlinkedId
      ? (unlinkedAppointments.find((a) => a.internalId === selectedUnlinkedId) ?? null)
      : null);
  const appointmentPreboundFromQuery = Boolean(boundAppointmentId);
  const showCreateAppointmentSection =
    mode === 'create' && !effectiveBoundAppointment && createAppointmentEnabled;

  // ── Форма создания записи (каноническая DoctorAppointmentForm) ─────────
  const [apptFilterMeta, setApptFilterMeta] = useState<CalendarFilterMeta>(EMPTY_FILTER_META);
  const [apptClinicSpecialists, setApptClinicSpecialists] = useState<
    readonly DoctorScheduleSpecialistOption[] | null
  >(null);
  const [apptFilterMetaLoaded, setApptFilterMetaLoaded] = useState(false);
  const [apptTimeZone, setApptTimeZone] = useState('UTC');
  const [apptDraft, setApptDraft] = useState<AppointmentFormDraft>(EMPTY_APPOINTMENT_DRAFT);
  const [apptMessage, setApptMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!showCreateAppointmentSection || apptFilterMetaLoaded) return;
    let cancelled = false;
    fetch(`${BOOKING_API_BASE}/calendar?view=day&scope=clinic`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<CalendarApiResponse>) : null))
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setApptFilterMeta(data.filters ?? EMPTY_FILTER_META);
        setApptClinicSpecialists(data.resolvedScope?.specialists ?? null);
        setApptTimeZone(data.timeZone ?? 'UTC');
        setApptDraft((prev) => ({
          ...prev,
          specialistId: prev.specialistId ?? data.resolvedScope?.ownSpecialistId ?? ownSpecialistId,
          start: prev.start || `${todayIsoDate()}T${nowHm()}`,
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setApptFilterMetaLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreateAppointmentSection, apptFilterMetaLoaded, ownSpecialistId]);

  const apptServiceOptions: CalendarServiceFilterOption[] = useMemo(() => {
    if (!apptDraft.specialistId || !apptDraft.branchId) return [];
    return apptFilterMeta.services.filter((service) =>
      service.availability.some(
        (a) => a.specialistId === apptDraft.specialistId && a.branchId === apptDraft.branchId,
      ),
    );
  }, [apptFilterMeta.services, apptDraft.specialistId, apptDraft.branchId]);

  const apptHideSpecialist =
    apptClinicSpecialists != null && apptClinicSpecialists.length === 1;
  const apptActiveFilters: CalendarCreateActiveFilters = {
    specialistId: null,
    branchId: null,
    roomId: null,
    serviceId: null,
  };
  const apptStatusOptions: AppointmentStatusOption[] = [];

  // ── Визит: содержательные поля ─────────────────────────────────────────
  const [date, setDate] = useState(() =>
    mode === 'edit' && initialVisit?.raw ? toIsoDate(new Date(initialVisit.raw.visitedAtIso)) : todayIsoDate(),
  );
  const [time, setTime] = useState(() => {
    if (mode === 'edit' && initialVisit?.raw) {
      const d = new Date(initialVisit.raw.visitedAtIso);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return nowHm();
  });
  const [location, setLocation] = useState(initialVisit?.location ?? '');
  const [duration, setDuration] = useState(initialVisit?.duration ?? '');
  const [service, setService] = useState(initialVisit?.raw?.service ?? '');
  const [anamnesisText, setAnamnesisText] = useState(initialVisit?.anamnesisText ?? '');
  const [exam, setExam] = useState(initialVisit?.raw?.exam ?? '');
  const [manipulations, setManipulations] = useState(initialVisit?.raw?.manipulations ?? '');
  const [trialResults, setTrialResults] = useState(initialVisit?.raw?.trialResults ?? '');
  const [recommendations, setRecommendations] = useState(
    initialVisit?.raw?.recommendations ?? '',
  );

  // Приём при связи с записью использует канонические поля записи (ENCOUNTER-APPOINTMENT-04):
  // локация/услуга подставляются из записи и остаются редактируемыми снимком визита, как в
  // existing visit snapshot model (source appointment prefill).
  const prefillConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'create' || !effectiveBoundAppointment) return;
    const key = effectiveBoundAppointment.id;
    if (prefillConsumedRef.current === key) return;
    prefillConsumedRef.current = key;
    const dt = effectiveBoundAppointment.dateTime ? new Date(effectiveBoundAppointment.dateTime) : null;
    if (dt) {
      setDate(toIsoDate(dt));
      setTime(`${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`);
    }
    if (effectiveBoundAppointment.location) setLocation(effectiveBoundAppointment.location);
    if (effectiveBoundAppointment.serviceName) setService(effectiveBoundAppointment.serviceName);
    if (effectiveBoundAppointment.durationMin) setDuration(String(effectiveBoundAppointment.durationMin));
  }, [mode, effectiveBoundAppointment]);

  // Первичный приём: собственные жалобы/диагнозы, создаваемые вместе с визитом (тот же write
  // path — CreateVisitInput.complaints/diagnoses).
  const [firstComplaints, setFirstComplaints] = useState<FormComplaintEntry[]>([
    { id: 'fc_init', priority: false, text: '', description: '', severity: 0 },
  ]);
  const [firstDiagnoses, setFirstDiagnoses] = useState<FormDiagnosisEntry[]>([]);

  // Повторный приём: динамика уже существующих жалоб/диагнозов.
  const [complaintUpdates, setComplaintUpdates] = useState<Record<string, RepeatComplaintUpdate>>(
    {},
  );
  const [diagnosisUpdates, setDiagnosisUpdates] = useState<Record<string, RepeatDiagnosisUpdate>>(
    {},
  );
  const complaintUpdatesInitRef = useRef(false);
  useEffect(() => {
    if (complaintUpdatesInitRef.current) return;
    if (activeComplaints.length === 0 && activeDiagnoses.length === 0) return;
    complaintUpdatesInitRef.current = true;
    setComplaintUpdates(
      Object.fromEntries(
        activeComplaints.map((c) => [
          c.id,
          { complaintId: c.id, note: '', severity: c.currentSeverity, resolved: false },
        ]),
      ),
    );
    setDiagnosisUpdates(
      Object.fromEntries(
        activeDiagnoses.map((d) => [d.id, { diagnosisId: d.id, refinement: '', removed: false }]),
      ),
    );
  }, [activeComplaints, activeDiagnoses]);

  // ── Симптомы/диагнозы: быстрое добавление (ENCOUNTER-PAGE-03) ─────────
  const [quickAddKind, setQuickAddKind] = useState<'complaint' | 'diagnosis' | null>(null);
  const [overlapConfirmOpen, setOverlapConfirmOpen] = useState(false);

  // ── Сохранение ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const backHref = patientCardHref(userId, { tab: 'karta' });

  const createLinkedAppointment = async (options?: { allowOverlap?: boolean }): Promise<
    | { ok: true; appointmentId: string; branchLabel: string | null; serviceLabel: string | null }
    | { ok: false }
  > => {
    const submission = resolveCalendarCreateSubmission({
      start: apptDraft.start,
      durationMinutes: apptDraft.durationMinutes,
      specialistId: apptDraft.specialistId,
      branchId: apptDraft.branchId,
      serviceId: apptDraft.serviceId,
      serviceIsOffered: apptServiceOptions.some((s) => s.id === apptDraft.serviceId),
    });
    if (!submission.ok) {
      setApptMessage(submission.message);
      return { ok: false };
    }
    const start = DateTime.fromFormat(submission.start, "yyyy-MM-dd'T'HH:mm", {
      zone: apptTimeZone,
    });
    if (!start.isValid) {
      setApptMessage('Укажите начало записи.');
      return { ok: false };
    }
    let financials: AppointmentFinancialRequestFields;
    try {
      financials = appointmentFinancialRequestFields(apptDraft);
    } catch (error) {
      setApptMessage(
        error instanceof AppointmentFormFinancialsError
          ? error.message
          : 'Проверьте стоимость записи.',
      );
      return { ok: false };
    }
    const specialistId = ownSpecialistId ?? submission.specialistId;
    const startAt = start.toUTC().toISO();
    const endAt = start.plus({ minutes: submission.durationMinutes }).toUTC().toISO();
    if (!startAt || !endAt) {
      setApptMessage('Укажите начало записи.');
      return { ok: false };
    }
    const res = await fetch(`${BOOKING_API_BASE}/appointments/manual`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platformUserId: userId,
        phoneNormalized: patient.phone,
        ...financials,
        ...(options?.allowOverlap ? { allowOverlap: true } : {}),
        startAt,
        endAt,
        durationMinutes: submission.durationMinutes,
        specialistId,
        branchId: submission.branchId,
        serviceId: submission.serviceId,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      appointment?: { id?: string };
    };
    if (!json.ok || !json.appointment?.id) {
      if (json.error === 'slot_overlap' && !options?.allowOverlap) {
        setOverlapConfirmOpen(true);
      } else setApptMessage('Не удалось создать запись.');
      return { ok: false };
    }
    const branchLabel =
      apptFilterMeta.branches.find((b) => b.id === submission.branchId)?.label ?? null;
    const serviceLabel = apptServiceOptions.find((s) => s.id === submission.serviceId)?.label ?? null;
    return { ok: true, appointmentId: json.appointment.id, branchLabel, serviceLabel };
  };

  const handleCreate = async (options?: { allowOverlap?: boolean }) => {
    setSaveError(null);
    if (appointmentPreboundFromQuery && !appointmentsLoading && !boundAppointment) {
      setSaveError('Не удалось подтвердить связанную запись.');
      return;
    }
    const missing: string[] = [];
    if (!showCreateAppointmentSection) {
      if (!location.trim()) missing.push('Место приёма');
      if (!service.trim()) missing.push('Услуга');
    }
    if (missing.length > 0) {
      setSaveError(`Заполните обязательные поля: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      let canonicalAppointmentId: string | undefined;
      let effectiveLocation = location.trim() || undefined;
      let effectiveService = service.trim() || undefined;
      let effectiveDuration = duration.trim() || undefined;
      let visitedAt = `${date}T${time}:00`;

      if (effectiveBoundAppointment) {
        canonicalAppointmentId = effectiveBoundAppointment.internalId ?? undefined;
      } else if (createAppointmentEnabled) {
        const created = await createLinkedAppointment(options);
        if (!created.ok) {
          return;
        }
        setOverlapConfirmOpen(false);
        canonicalAppointmentId = created.appointmentId;
        visitedAt = `${apptDraft.start}:00`;
        effectiveLocation = created.branchLabel ?? effectiveLocation;
        effectiveService = created.serviceLabel ?? effectiveService;
        effectiveDuration = apptDraft.durationMinutes ? String(apptDraft.durationMinutes) : effectiveDuration;
      }

      const body: CreateVisitRequest = {
        visitType,
        date: visitedAt,
        location: effectiveLocation,
        service: effectiveService,
        duration: effectiveDuration,
        anamnesisText: anamnesisText.trim() || undefined,
        ...(canonicalAppointmentId ? { canonicalAppointmentId } : {}),
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
        if (exam.trim()) body.exam = exam;
        if (manipulations.trim()) body.manipulations = manipulations;
        if (trialResults.trim()) body.trialResults = trialResults;
        if (recommendations.trim()) body.recommendations = recommendations;
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
        if (exam.trim()) body.exam = exam;
        if (manipulations.trim()) body.manipulations = manipulations;
        if (recommendations.trim()) body.recommendations = recommendations;
      }

      const res = await fetch(`/api/doctor/patients/${userId}/visits`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`status ${res.status}${text ? `: ${text}` : ''}`);
      }
      toast.success('Приём сохранён');
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!initialVisit) return;
    setSaveError(null);
    setSaving(true);
    try {
      const body: UpdateVisitRequest = {
        location: location.trim(),
        duration: duration.trim(),
        anamnesisText: anamnesisText.trim(),
        exam: exam.trim(),
        manipulations: manipulations.trim(),
        trialResults: trialResults.trim(),
        recommendations: recommendations.trim(),
      };
      const res = await fetch(`/api/doctor/patients/${userId}/visits/${initialVisit.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`status ${res.status}${text ? `: ${text}` : ''}`);
      }
      toast.success('Изменения сохранены');
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const addFirstComplaint = () =>
    setFirstComplaints((prev) => [
      ...prev,
      { id: `fc${prev.length}_${Date.now()}`, priority: false, text: '', description: '', severity: 0 },
    ]);

  const patientFio = [patient.lastName, patient.firstName].filter(Boolean).join(' ') || patient.displayName;

  return (
    <div className="flex flex-col gap-3">
      {/* Контекст пациента и записи — ENCOUNTER-PAGE-01 */}
      <section className={doctorSectionCardClass}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={doctorSectionTitleClass}>Пациент</h2>
          <span className="text-sm font-medium text-foreground">{patientFio}</span>
        </div>
        {mode === 'edit' && initialVisit ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className={hintClass}>Дата и время</dt>
              <dd className="text-foreground">
                {initialVisit.date} {initialVisit.time}
              </dd>
            </div>
            <div>
              <dt className={hintClass}>Тип приёма</dt>
              <dd className="text-foreground">
                {initialVisit.type === 'first' ? 'Первичный' : 'Повторный'}
              </dd>
            </div>
            <div>
              <dt className={hintClass}>Запись</dt>
              <dd className="text-foreground">
                {appointmentsLoading ? (
                  <DoctorPanelLoading className="py-1" />
                ) : boundAppointment ? (
                  appointmentSummaryLine(boundAppointment)
                ) : initialVisit.canonicalAppointmentId ? (
                  'Связанная запись не найдена.'
                ) : (
                  'Без связи с записью'
                )}
              </dd>
            </div>
          </dl>
        ) : null}
        {mode === 'create' && appointmentPreboundFromQuery ? (
          <p className="text-sm text-foreground">
            {appointmentsLoading ? (
              <DoctorPanelLoading className="py-1" />
            ) : boundAppointment ? (
              `Связан с записью: ${appointmentSummaryLine(boundAppointment)}`
            ) : (
              'Запись не найдена.'
            )}
          </p>
        ) : null}
      </section>

      {/* Связь с записью — ENCOUNTER-APPOINTMENT-02/03/04 */}
      {mode === 'create' && !appointmentPreboundFromQuery ? (
        <section className={cn(doctorSectionCardClass)}>
          <h2 className={doctorSectionTitleClass}>Связь с записью</h2>
          {appointmentsLoading ? (
            <DoctorPanelLoading className="py-2" />
          ) : (
            <>
              <div className="space-y-1.5">
                <label className={fieldLabelClass}>Существующая запись пациента</label>
                <Select
                  value={selectedUnlinkedId || '__none__'}
                  onValueChange={(v) => setSelectedUnlinkedId(v === '__none__' ? '' : (v ?? ''))}
                >
                  <SelectTrigger
                    className="w-full"
                    displayLabel={
                      selectedUnlinkedId
                        ? appointmentSummaryLine(
                            unlinkedAppointments.find((a) => a.internalId === selectedUnlinkedId)!,
                          )
                        : 'Без записи'
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Без записи</SelectItem>
                    {unlinkedAppointments.map((a) => (
                      <SelectItem key={a.internalId ?? a.id} value={a.internalId ?? a.id}>
                        {appointmentSummaryLine(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!selectedUnlinkedId ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={createAppointmentEnabled}
                    onCheckedChange={(v) => setCreateAppointmentEnabled(v === true)}
                  />
                  Создать запись
                </label>
              ) : null}
            </>
          )}
          {showCreateAppointmentSection ? (
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <DoctorAppointmentForm
                mode="create"
                draft={apptDraft}
                onDraftChange={(patch) => setApptDraft((prev) => ({ ...prev, ...patch }))}
                filterMeta={apptFilterMeta}
                serviceOptions={apptServiceOptions}
                activeFilters={apptActiveFilters}
                hideSpecialist={apptHideSpecialist}
                hidePatient
                statusOptions={apptStatusOptions}
                pending={saving}
                message={apptMessage}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Симптомы и диагнозы пациента — ENCOUNTER-PAGE-03 */}
      <section className={doctorSectionCardClass}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={doctorSectionTitleClass}>Симптомы и диагнозы</h2>
        </div>
        {clinicalLoading ? <DoctorPanelLoading className="py-2" /> : null}
        {!clinicalLoading && clinicalError ? (
          <p className="text-sm text-destructive">Не удалось загрузить симптомы и диагнозы.</p>
        ) : null}
        {!clinicalLoading && !clinicalError ? (
          <div className="flex flex-col gap-2 text-sm">
            {activeComplaints.length === 0 && activeDiagnoses.length === 0 ? (
              <p className={hintClass}>Активных симптомов и диагнозов нет.</p>
            ) : (
              <>
                {activeComplaints.map((c) => (
                  <p key={c.id}>
                    {c.priority ? <span className="font-bold text-destructive">! </span> : null}
                    {c.text} — {c.currentSeverity}/10
                  </p>
                ))}
                {activeDiagnoses.map((d) => (
                  <p key={d.id}>
                    {d.priority ? <span className="font-bold text-destructive">! </span> : null}
                    {d.text} ({d.clinicalStatus})
                  </p>
                ))}
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setQuickAddKind('complaint')}>
                + Симптом
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setQuickAddKind('diagnosis')}>
                + Диагноз
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Содержимое приёма — ENCOUNTER-PAGE-02 */}
      <section className={cn(doctorSectionCardClass)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={doctorSectionTitleClass}>Приём</h2>
          {mode === 'create' ? (
            <span className="flex gap-1">
              {(['first', 'repeat'] as const).map((vt) => (
                <Button
                  key={vt}
                  type="button"
                  onClick={() => setVisitType(vt)}
                  size="sm"
                  variant={visitType === vt ? 'default' : 'ghost'}
                >
                  {vt === 'first' ? 'Первичный' : 'Повторный'}
                </Button>
              ))}
            </span>
          ) : null}
        </div>

        {mode === 'create' && !showCreateAppointmentSection ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className={fieldLabelClass}>Дата</label>
              <DoctorDatePicker value={date} onChange={setDate} disabled={Boolean(effectiveBoundAppointment)} />
            </div>
            <div className="space-y-1">
              <label className={fieldLabelClass}>Время</label>
              <DoctorDateTimePicker
                mode="time"
                value={time}
                onChange={setTime}
                disabled={Boolean(effectiveBoundAppointment)}
                ariaLabel="Время приёма"
              />
            </div>
            <div className="space-y-1">
              <label className={fieldLabelClass}>Место приёма *</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className={fieldLabelClass}>Услуга *</label>
              <Input value={service} onChange={(e) => setService(e.target.value)} />
            </div>
          </div>
        ) : null}

        {mode === 'edit' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={fieldLabelClass}>Место приёма</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className={fieldLabelClass}>Услуга</label>
              <Input value={service} disabled title="Услуга не редактируется — снимок записи" />
            </div>
            <div className="space-y-1">
              <label className={fieldLabelClass}>Длительность, мин</label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="w-32 space-y-1">
            <label className={fieldLabelClass}>Длительность, мин</label>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        )}

        <FormTextarea
          label="Анамнез / история появления жалобы"
          placeholder="Когда и как появилась жалоба, что предшествовало, как менялась…"
          value={anamnesisText}
          onChange={setAnamnesisText}
        />

        {mode === 'create' && visitType === 'first' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={fieldLabelClass}>Симптомы</span>
                <Button type="button" onClick={addFirstComplaint} variant="ghost" size="icon-xs">
                  +
                </Button>
              </div>
              {firstComplaints.map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/10 p-2">
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
                      className="w-16"
                    />
                  </div>
                </div>
              ))}
              <DiagnosisAutocomplete
                userId={userId}
                onSelect={(entry) => setFirstDiagnoses((prev) => [...prev, entry])}
              />
              {firstDiagnoses.map((d) => (
                <p key={d.id} className="text-sm">
                  {d.text}
                </p>
              ))}
            </div>

            <FormTextarea label="Осмотр" placeholder="Данные объективного осмотра…" value={exam} onChange={setExam} />
            <VisitCatalogTextarea
              label="Проведённые манипуляции"
              placeholder="Проведённые манипуляции…"
              value={manipulations}
              onChange={setManipulations}
              catalog="manipulations"
            />
            <FormTextarea
              label="Результаты пробного лечения"
              placeholder="Динамика / результат…"
              value={trialResults}
              onChange={setTrialResults}
            />
            <VisitCatalogTextarea
              label="Рекомендации / Назначения"
              placeholder="Рекомендации / назначения…"
              value={recommendations}
              onChange={setRecommendations}
              catalog="recommendations"
            />
          </>
        ) : null}

        {mode === 'create' && visitType === 'repeat' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Динамика симптомов</span>
              {activeComplaints.map((c) => {
                const upd = complaintUpdates[c.id] ?? {
                  complaintId: c.id,
                  note: '',
                  severity: c.currentSeverity,
                  resolved: false,
                };
                const setUpd = (patch: Partial<RepeatComplaintUpdate>) =>
                  setComplaintUpdates((prev) => ({ ...prev, [c.id]: { ...upd, ...patch } }));
                return (
                  <div key={c.id} className="rounded-lg border border-border bg-muted/15 p-2.5">
                    <p className="text-xs text-muted-foreground">{c.text}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Input
                        placeholder="Заметка…"
                        value={upd.note}
                        onChange={(e) => setUpd({ note: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={upd.severity}
                        onChange={(e) => setUpd({ severity: Number(e.target.value) })}
                        className="w-16"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={upd.resolved}
                          onCheckedChange={(v) => setUpd({ resolved: v === true })}
                        />
                        Решена
                      </label>
                    </div>
                  </div>
                );
              })}
              {activeDiagnoses.map((d) => {
                const upd = diagnosisUpdates[d.id] ?? { diagnosisId: d.id, refinement: '', removed: false };
                const setUpd = (patch: Partial<RepeatDiagnosisUpdate>) =>
                  setDiagnosisUpdates((prev) => ({ ...prev, [d.id]: { ...upd, ...patch } }));
                return (
                  <div key={d.id} className="rounded-lg border border-border bg-muted/15 p-2.5">
                    <p className="text-xs text-muted-foreground">{d.text}</p>
                    <Input
                      className="mt-1.5"
                      placeholder="Уточнение…"
                      value={upd.refinement}
                      onChange={(e) => setUpd({ refinement: e.target.value })}
                    />
                    <label className="mt-1.5 flex items-center gap-1 text-xs">
                      <Checkbox checked={upd.removed} onCheckedChange={(v) => setUpd({ removed: v === true })} />
                      Снять диагноз
                    </label>
                  </div>
                );
              })}
            </div>
            <FormTextarea label="Осмотр" placeholder="Данные объективного осмотра…" value={exam} onChange={setExam} />
            <VisitCatalogTextarea
              label="Проведённые манипуляции"
              placeholder="Проведённые манипуляции…"
              value={manipulations}
              onChange={setManipulations}
              catalog="manipulations"
            />
            <VisitCatalogTextarea
              label="Рекомендации / Назначения — коррекция"
              placeholder="Рекомендации / назначения…"
              value={recommendations}
              onChange={setRecommendations}
              catalog="recommendations"
            />
          </>
        ) : null}

        {mode === 'edit' ? (
          <>
            {initialVisit?.dynamics?.length ? (
              <div className="flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Динамика, записанная на этом приёме</span>
                {initialVisit.dynamics.map((row) => (
                  <p key={row.id} className="text-sm text-muted-foreground">
                    {row.label}: {row.from} → {row.to}
                    {row.note ? ` — ${row.note}` : ''}
                  </p>
                ))}
              </div>
            ) : null}
            <FormTextarea label="Осмотр" placeholder="Данные объективного осмотра…" value={exam} onChange={setExam} />
            <VisitCatalogTextarea
              label="Проведённые манипуляции"
              placeholder="Проведённые манипуляции…"
              value={manipulations}
              onChange={setManipulations}
              catalog="manipulations"
            />
            {initialVisit?.type === 'first' ? (
              <FormTextarea
                label="Результаты пробного лечения"
                placeholder="Динамика / результат…"
                value={trialResults}
                onChange={setTrialResults}
              />
            ) : null}
            <VisitCatalogTextarea
              label="Рекомендации / Назначения"
              placeholder="Рекомендации / назначения…"
              value={recommendations}
              onChange={setRecommendations}
              catalog="recommendations"
            />
          </>
        ) : null}
      </section>

      {saveError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={saving}
          onClick={() => void (mode === 'create' ? handleCreate() : handleSaveEdit())}
        >
          {saving ? 'Сохранение…' : 'Сохранить приём'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)}>
          Отмена
        </Button>
      </div>

      {quickAddKind ? (
        <PatientClinicalCreateModal
          kind={quickAddKind}
          open
          userId={userId}
          patientName={patientFio}
          patientOnSupport={false}
          onClose={() => setQuickAddKind(null)}
          onSaved={reloadClinical}
        />
      ) : null}

      <DoctorModal
        open={overlapConfirmOpen}
        onClose={() => setOverlapConfirmOpen(false)}
        title="Время занято"
        size="sm"
      >
        <p className="text-sm text-foreground">
          На это время у специалиста уже есть запись. Создать наложение?
        </p>
        <DoctorModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => setOverlapConfirmOpen(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate({ allowOverlap: true })}
          >
            Создать наложение
          </Button>
        </DoctorModalFooter>
      </DoctorModal>
    </div>
  );
}
