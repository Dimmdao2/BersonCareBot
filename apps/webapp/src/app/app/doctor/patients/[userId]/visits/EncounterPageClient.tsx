'use client';

/**
 * EncounterPageClient — полноценная страница приёма (P4.5/P4.6).
 *
 * Reuse map (ENCOUNTER-PAGE-02, «Один общий проход»):
 *   - Visit write path:       POST/PATCH /api/doctor/patients/[userId]/visits[/[visitId]].
 *   - Symptom/diagnosis forms: POST /api/doctor/patients/[userId]/complaints|diagnoses
 *                              (те же эндпойнты, что PatientClinicalSections.tsx).
 *   - Appointment linkage:     выбран до открытия страницы общей стартовой модалкой пациента;
 *                              страница получает только готовый appointmentId либо режим без записи.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, HeartPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  ActiveComplaint,
  ActiveDiagnosis,
  ClinicalState,
  CreateVisitComplaintUpdate,
  CreateVisitDiagnosis,
  CreateVisitDiagnosisUpdate,
  UpdateVisitFieldsInput,
  Visit,
} from '@/modules/patient-clinical/ports';
import type { PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import { DoctorDateTimePicker } from '@/shared/ui/doctor/DoctorDateTimePicker';
import { patientCardHref } from '../../patientCardHref';
import { PatientClinicalCreateModal } from '../tabs/karta/PatientClinicalSections';
import { displayZonePartsFromUtcInstant } from '@/shared/datetime/displayTimeZoneFormat';
import { VisitCatalogTextarea } from './VisitCatalogTextarea';
import {
  DiagnosisAutocomplete,
  FormTextarea,
  type FormDiagnosisEntry,
} from './EncounterFormFields';
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
  /** Canonical appointment id — задан только когда страница открыта из деталей записи. */
  boundAppointmentId: string | null;
  /** Только для mode="edit": визит, загруженный сервером. */
  initialVisit?: Visit;
  medicalRecordEnabled?: boolean;
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

type ClinicalApiResponse = { ok: boolean; state: ClinicalState };
type AppointmentsApiResponse = { appointments: PatientAppointmentItem[] };

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
  diagnoses?: CreateVisitDiagnosis[];
  complaintUpdates?: CreateVisitComplaintUpdate[];
  diagnosisUpdates?: CreateVisitDiagnosisUpdate[];
};

type UpdateVisitRequest = Omit<UpdateVisitFieldsInput, 'patientUserId' | 'visitId'>;

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
  let dt = '—';
  if (appointment.dateTime) {
    if (appointment.branchTimeZone) {
      const parts = displayZonePartsFromUtcInstant(
        appointment.dateTime,
        appointment.branchTimeZone,
      );
      const month = RU_MONTHS_GENITIVE[Number(parts.month) - 1] ?? parts.month;
      dt = `${Number(parts.day)} ${month} ${parts.year}, ${parts.hour}:${parts.minute}`;
    } else {
      dt = new Date(appointment.dateTime).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  const parts = [
    dt,
    appointment.location,
    appointment.specialistName,
    appointment.serviceName,
  ].filter(Boolean);
  return parts.join(' · ');
}

const RU_MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

function formDateTimeParts(utcIso: string, timeZone: string) {
  const parts = displayZonePartsFromUtcInstant(utcIso, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function EncounterPageClient({
  mode,
  userId,
  patient,
  boundAppointmentId,
  initialVisit,
  medicalRecordEnabled = true,
}: Props) {
  const router = useRouter();

  // ── Clinical state (симптомы/диагнозы/история визитов) ───────────────────
  const [clinicalLoading, setClinicalLoading] = useState(medicalRecordEnabled);
  const [clinicalError, setClinicalError] = useState(false);
  const [clinicalState, setClinicalState] = useState<ClinicalState | null>(null);

  const reloadClinical = useCallback(() => {
    if (!medicalRecordEnabled) {
      setClinicalState(null);
      setClinicalLoading(false);
      return;
    }
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
  }, [userId, medicalRecordEnabled]);

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
    if (!medicalRecordEnabled) return;
    if (activeComplaints.length === 0 && activeDiagnoses.length === 0) setVisitType('first');
    else setVisitType('repeat');
  }, [mode, activeComplaints, activeDiagnoses, medicalRecordEnabled]);

  // ── Связь с записью (создание) ────────────────────────────────────────
  const [boundAppointment, setBoundAppointment] = useState<PatientAppointmentItem | null>(null);
  const [appointmentsLoading, setAppointmentsLoading] = useState(
    Boolean(boundAppointmentId ?? initialVisit?.canonicalAppointmentId),
  );

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
    } else {
      setAppointmentsLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [mode, userId, appointmentIdToLoad]);

  // ── Визит: содержательные поля ─────────────────────────────────────────
  const [date, setDate] = useState(() =>
    mode === 'edit' && initialVisit?.raw && initialVisit.timeZone
      ? formDateTimeParts(initialVisit.raw.visitedAtIso, initialVisit.timeZone).date
      : mode === 'edit' && initialVisit?.raw
        ? toIsoDate(new Date(initialVisit.raw.visitedAtIso))
        : todayIsoDate(),
  );
  const [time, setTime] = useState(() => {
    if (mode === 'edit' && initialVisit?.raw) {
      if (initialVisit.timeZone) {
        return formDateTimeParts(initialVisit.raw.visitedAtIso, initialVisit.timeZone).time;
      }
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
  const [recommendations, setRecommendations] = useState(initialVisit?.raw?.recommendations ?? '');

  // Приём при связи с записью использует канонические поля записи (ENCOUNTER-APPOINTMENT-04):
  // локация/услуга подставляются из записи и остаются редактируемыми снимком визита, как в
  // existing visit snapshot model (source appointment prefill).
  const prefillConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== 'create' || !boundAppointment) return;
    const key = boundAppointment.id;
    if (prefillConsumedRef.current === key) return;
    prefillConsumedRef.current = key;
    if (boundAppointment.dateTime) {
      if (boundAppointment.branchTimeZone) {
        const parts = formDateTimeParts(boundAppointment.dateTime, boundAppointment.branchTimeZone);
        setDate(parts.date);
        setTime(parts.time);
      } else {
        const dt = new Date(boundAppointment.dateTime);
        setDate(toIsoDate(dt));
        setTime(
          `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
        );
      }
    }
    if (boundAppointment.location) setLocation(boundAppointment.location);
    if (boundAppointment.serviceName) setService(boundAppointment.serviceName);
    if (boundAppointment.durationMin) setDuration(String(boundAppointment.durationMin));
  }, [mode, boundAppointment]);

  // Первичный приём: собственные жалобы/диагнозы, создаваемые вместе с визитом (тот же write
  // path — CreateVisitInput.complaints/diagnoses).
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

  // ── Сохранение ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const backHref = patientCardHref(userId, { tab: 'karta' });

  const handleCreate = async () => {
    setSaveError(null);
    if (boundAppointmentId && !appointmentsLoading && !boundAppointment) {
      setSaveError('Не удалось подтвердить связанную запись.');
      return;
    }
    const missing: string[] = [];
    if (!location.trim()) missing.push('Место приёма');
    if (!service.trim()) missing.push('Услуга');
    if (missing.length > 0) {
      setSaveError(`Заполните обязательные поля: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const canonicalAppointmentId = boundAppointment?.internalId ?? undefined;

      const body: CreateVisitRequest = {
        visitType,
        date: `${date}T${time}:00`,
        location: location.trim() || undefined,
        service: service.trim() || undefined,
        duration: duration.trim() || undefined,
        anamnesisText: anamnesisText.trim() || undefined,
        ...(canonicalAppointmentId ? { canonicalAppointmentId } : {}),
      };

      if (medicalRecordEnabled && visitType === 'first') {
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
      } else if (medicalRecordEnabled) {
        const cuList = Object.values(complaintUpdates)
          .filter(
            (u) =>
              u.note.trim() ||
              u.resolved ||
              u.severity !==
                (activeComplaints.find((c) => c.id === u.complaintId)?.currentSeverity ??
                  u.severity),
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

  const patientFio =
    [patient.lastName, patient.firstName].filter(Boolean).join(' ') || patient.displayName;

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
        {mode === 'create' ? (
          <div className="text-sm text-foreground">
            {!boundAppointmentId ? (
              'Без связи с записью'
            ) : appointmentsLoading ? (
              <DoctorPanelLoading className="py-1" />
            ) : boundAppointment ? (
              `Связан с записью: ${appointmentSummaryLine(boundAppointment)}`
            ) : (
              'Запись не найдена.'
            )}
          </div>
        ) : null}
      </section>

      {medicalRecordEnabled ? (
        <>
          {/* Симптомы — отдельный блок ENCOUNTER-PAGE-12/13/20 */}
          <section className={doctorSectionCardClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={doctorSectionTitleClass}>Симптомы</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Добавить симптом"
                aria-label="Добавить симптом"
                onClick={() => setQuickAddKind('complaint')}
              >
                <FilePlus2 className="size-5" />
              </Button>
            </div>
            {clinicalLoading ? <DoctorPanelLoading className="py-2" /> : null}
            {!clinicalLoading && clinicalError ? (
              <p className="text-sm text-destructive">Не удалось загрузить симптомы.</p>
            ) : null}
            {!clinicalLoading && !clinicalError ? (
              <div className="flex flex-col gap-2 text-sm">
                {mode === 'create' && visitType === 'repeat'
                  ? activeComplaints.map((c) => {
                      const upd = complaintUpdates[c.id] ?? {
                        complaintId: c.id,
                        note: '',
                        severity: c.currentSeverity,
                        resolved: false,
                      };
                      const setUpd = (patch: Partial<RepeatComplaintUpdate>) =>
                        setComplaintUpdates((prev) => ({ ...prev, [c.id]: { ...upd, ...patch } }));
                      return (
                        <div
                          key={c.id}
                          className="border-b border-border pb-2 last:border-0 last:pb-0"
                        >
                          <p>
                            {c.priority ? (
                              <span className="font-bold text-destructive">! </span>
                            ) : null}
                            {c.text}
                          </p>
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
                              Закрыт
                            </label>
                          </div>
                        </div>
                      );
                    })
                  : activeComplaints.map((c) => (
                      <p key={c.id}>
                        {c.priority ? <span className="font-bold text-destructive">! </span> : null}
                        {c.text} — {c.currentSeverity}/10
                      </p>
                    ))}
                {mode === 'edit' && initialVisit?.dynamics?.length
                  ? initialVisit.dynamics.map((row) => (
                      <p key={row.id} className="text-muted-foreground">
                        {row.label}: {row.from} → {row.to}
                        {row.note ? ` — ${row.note}` : ''}
                      </p>
                    ))
                  : null}
              </div>
            ) : null}
          </section>

          {/* Диагнозы — отдельный блок ENCOUNTER-PAGE-12/21 */}
          <section className={doctorSectionCardClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className={doctorSectionTitleClass}>Диагнозы</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Добавить диагноз"
                aria-label="Добавить диагноз"
                onClick={() => setQuickAddKind('diagnosis')}
              >
                <HeartPlus className="size-5" />
              </Button>
            </div>
            {clinicalLoading ? <DoctorPanelLoading className="py-2" /> : null}
            {!clinicalLoading && clinicalError ? (
              <p className="text-sm text-destructive">Не удалось загрузить диагнозы.</p>
            ) : null}
            {!clinicalLoading && !clinicalError ? (
              <div className="flex flex-col gap-2 text-sm">
                {mode === 'create' && visitType === 'repeat'
                  ? activeDiagnoses.map((d) => {
                      const upd = diagnosisUpdates[d.id] ?? {
                        diagnosisId: d.id,
                        refinement: '',
                        removed: false,
                      };
                      const setUpd = (patch: Partial<RepeatDiagnosisUpdate>) =>
                        setDiagnosisUpdates((prev) => ({ ...prev, [d.id]: { ...upd, ...patch } }));
                      return (
                        <div
                          key={d.id}
                          className="border-b border-border pb-2 last:border-0 last:pb-0"
                        >
                          <p>
                            {d.priority ? (
                              <span className="font-bold text-destructive">! </span>
                            ) : null}
                            {d.text}
                          </p>
                          <Input
                            className="mt-1.5"
                            placeholder="Уточнение…"
                            value={upd.refinement}
                            onChange={(e) => setUpd({ refinement: e.target.value })}
                          />
                          <label className="mt-1.5 flex items-center gap-1 text-xs">
                            <Checkbox
                              checked={upd.removed}
                              onCheckedChange={(v) => setUpd({ removed: v === true })}
                            />
                            Снять диагноз
                          </label>
                        </div>
                      );
                    })
                  : activeDiagnoses.map((d) => (
                      <p key={d.id}>
                        {d.priority ? <span className="font-bold text-destructive">! </span> : null}
                        {d.text} ({d.clinicalStatus})
                      </p>
                    ))}
                {mode === 'create' && visitType === 'first' ? (
                  <>
                    <DiagnosisAutocomplete
                      userId={userId}
                      onSelect={(entry) => setFirstDiagnoses((prev) => [...prev, entry])}
                    />
                    {firstDiagnoses.map((d) => (
                      <p key={d.id}>{d.text}</p>
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

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

        {mode === 'create' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className={fieldLabelClass}>Дата</label>
              <DoctorDatePicker
                value={date}
                onChange={setDate}
                disabled={Boolean(boundAppointment)}
              />
            </div>
            <div className="space-y-1">
              <label className={fieldLabelClass}>Время</label>
              <DoctorDateTimePicker
                mode="time"
                value={time}
                onChange={setTime}
                disabled={Boolean(boundAppointment)}
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
            <FormTextarea
              label="Осмотр"
              placeholder="Данные объективного осмотра…"
              value={exam}
              onChange={setExam}
            />
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
            <FormTextarea
              label="Осмотр"
              placeholder="Данные объективного осмотра…"
              value={exam}
              onChange={setExam}
            />
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
            <FormTextarea
              label="Осмотр"
              placeholder="Данные объективного осмотра…"
              value={exam}
              onChange={setExam}
            />
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

      {medicalRecordEnabled && quickAddKind ? (
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
    </div>
  );
}
