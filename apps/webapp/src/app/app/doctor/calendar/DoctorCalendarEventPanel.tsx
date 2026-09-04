'use client';

import Link from 'next/link';
import { patientCardHref } from '../patients/patientCardHref';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { DoctorModalFooter } from '@/shared/ui/doctor/DoctorModal';
import { doctorMetricValueClass } from '@/shared/ui/doctor/doctorVisual';
import { doctorClientOverviewPrimaryCardClass } from '../clients/doctorClientCardChrome';
import type {
  CalendarAppointmentEvent,
  CalendarFilterMeta,
  CalendarFilterOption,
  CalendarServiceFilterOption,
} from '@/modules/booking-calendar/types';
import type { CalendarCreateActiveFilters } from '@/modules/booking-calendar/calendarCreateFieldMode';
import {
  resolveCalendarCreateFieldValue,
  resolveCalendarCreateSubmission,
} from '@/modules/booking-calendar/calendarCreateFieldMode';
import type {
  AppointmentCancellationRecord,
  AppointmentRescheduleRecord,
} from '@/modules/booking-appointment-lifecycle/ports';
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
  isStaffDeletableCancelledStatus,
} from '@/modules/booking-calendar/appointmentStatusLabels';
import { cancellationDecisionTypeLabel, paymentStatusLabel } from '@/modules/client-history/labels';
import type { CalendarPatientOption } from './DoctorCalendarPatientSearch';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import {
  canUseOwnSpecialistAppointmentActions,
  type DoctorScheduleSpecialistOption,
} from '@/modules/doctor-schedule/scope';
import { AppointmentPaymentSection } from './AppointmentPaymentSection';
import {
  DoctorAppointmentForm,
  type AppointmentFormDraft,
  type AppointmentStatusOption,
} from './DoctorAppointmentForm';
import {
  DoctorAppointmentCancelModal,
  type AppointmentCancelDraft,
} from './DoctorAppointmentCancelModal';

const FORM_START_FORMAT = "yyyy-MM-dd'T'HH:mm";

type Props = {
  apiBase: string;
  selected: CalendarAppointmentEvent | null;
  timeZone: string;
  filterMeta: CalendarFilterMeta;
  activeFilters: CalendarCreateActiveFilters;
  ownSpecialistId: string | null;
  /**
   * Каталог специалистов клиники из `resolvedScope` — единственное доказательство того,
   * что специалист в клинике ровно один (APPT-FORM-07). `filterMeta.specialists` сужен
   * текущим scope календаря и «одиночкой» становится даже в клинике из десяти врачей.
   */
  clinicSpecialists?: readonly DoctorScheduleSpecialistOption[] | null;
  onClose: () => void;
  onChanged: () => void;
  /** §3.6: открыть панель сразу в режиме создания, минуя плейсхолдер */
  startInCreate?: boolean;
  /** R32: подставить время старта (datetime-local) при выделении области в календаре */
  createInitialStart?: string | null;
  /** #225: конец drag-интервала ("yyyy-MM-dd'T'HH:mm") → начальная длительность в форме */
  createInitialEnd?: string | null;
  createInitialBranchId?: string | null;
  createInitialServiceId?: string | null;
  createInitialSpecialistId?: string | null;
  /** Patient already known by the host (for example, from the patient card). */
  createInitialPatient?: CalendarPatientOption | null;
  onCreateDirtyChange?: (dirty: boolean) => void;
  /** Host already owns the border and padding (for example the schedule details drawer). */
  flushChrome?: boolean;
};

type LifecycleResponse = {
  ok: boolean;
  reschedules: AppointmentRescheduleRecord[];
  cancellations: AppointmentCancellationRecord[];
};

type AppointmentCommentRow = { id: string; body: string; createdAt: string };

function parseEventDateTime(iso: string, timeZone: string): DateTime {
  // R27: originalStartAt приходит из canonical-порта в Postgres timestamptz формате
  // ("2026-06-13 10:00:00+02", пробел вместо "T") — строгий fromISO даёт Invalid.
  // Парсим терпимо: ISO → SQL → нативный Date.
  let dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromSQL(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromJSDate(new Date(iso));
  return dt.isValid ? dt.setZone(timeZone).startOf('minute') : dt;
}

function formatEventAt(iso: string, timeZone: string): string {
  const dt = parseEventDateTime(iso, timeZone);
  return dt.isValid ? dt.toFormat('dd.MM.yyyy HH:mm') : '—';
}

/** APPT-DETAIL-01: дата и время верхней строки — с названием месяца словом. */
function formatEventAtWords(iso: string, timeZone: string): string {
  const dt = parseEventDateTime(iso, timeZone);
  return dt.isValid ? dt.setLocale('ru').toFormat('d MMMM yyyy, HH:mm') : '—';
}

function isSameCalendarMinute(left: string, right: string, timeZone: string): boolean {
  const l = parseEventDateTime(left, timeZone);
  const r = parseEventDateTime(right, timeZone);
  return l.isValid && r.isValid && l.toMillis() === r.toMillis();
}

function isDifferentCalendarMinute(left: string, right: string, timeZone: string): boolean {
  const l = parseEventDateTime(left, timeZone);
  const r = parseEventDateTime(right, timeZone);
  return l.isValid && r.isValid && l.toMillis() !== r.toMillis();
}

/** Форма отдаёт стенные часы календаря — тот же формат, в котором их подставляет сетка. */
function parseFormStart(value: string, timeZone: string): DateTime {
  return DateTime.fromFormat(value, FORM_START_FORMAT, { zone: timeZone });
}

function eventDurationMinutes(event: CalendarAppointmentEvent, timeZone: string): number | null {
  const start = parseEventDateTime(event.startAt, timeZone);
  const end = parseEventDateTime(event.endAt, timeZone);
  if (!start.isValid || !end.isValid) return null;
  const minutes = Math.round(end.diff(start, 'minutes').minutes);
  return minutes > 0 ? minutes : null;
}

function appointmentStatusToneClass(status: string): string {
  if (
    ['confirmed', 'paid', 'completed', 'visit_confirmed', 'charged_to_package'].includes(status)
  ) {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100';
  }
  if (
    ['cancelled_by_patient', 'cancelled_by_specialist', 'late_cancellation', 'no_show'].includes(
      status,
    )
  ) {
    return 'border-destructive/30 bg-destructive/15 text-destructive';
  }
  if (status === 'rescheduled') {
    return 'border-purple-500/40 bg-purple-500/10 text-purple-800 dark:text-purple-200';
  }
  if (['awaiting_payment', 'manual_review_required'].includes(status)) {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100';
  }
  return 'border-primary/30 bg-primary/10 text-primary';
}

function panelErrorLabel(error: string | undefined): string {
  if (!error) return 'Ошибка';
  if (error === 'external_slot_taken') return 'Время уже занято во внешней записи.';
  if (error === 'slot_overlap') return 'Слот уже занят.';
  if (error === 'not_cancelled') return 'Сначала отмените запись.';
  return error;
}

function listCreateServicesForSelection(
  services: CalendarServiceFilterOption[],
  specialistId: string | null,
  branchId: string | null,
): CalendarServiceFilterOption[] {
  if (!specialistId || !branchId) return [];
  return services.filter((service) =>
    service.availability.some(
      (availability) =>
        availability.specialistId === specialistId && availability.branchId === branchId,
    ),
  );
}

const EMPTY_DRAFT: AppointmentFormDraft = {
  start: '',
  durationMinutes: null,
  specialistId: null,
  branchId: null,
  serviceId: null,
  patient: null,
  comment: '',
  status: null,
};

const EMPTY_CANCEL_DRAFT: AppointmentCancelDraft = {
  reason: '',
  comment: '',
  charge: 'free',
  notify: true,
};

export function DoctorCalendarEventPanel(props: Props) {
  return <DoctorCalendarEventPanelInner key={props.selected?.id ?? 'none'} {...props} />;
}

function DoctorCalendarEventPanelInner({
  apiBase,
  selected,
  timeZone,
  filterMeta,
  activeFilters,
  ownSpecialistId,
  clinicSpecialists = null,
  onClose,
  onChanged,
  startInCreate = false,
  createInitialStart = null,
  createInitialEnd = null,
  createInitialBranchId = null,
  createInitialServiceId = null,
  createInitialSpecialistId = null,
  createInitialPatient = null,
  onCreateDirtyChange,
  flushChrome = false,
}: Props) {
  // §3.6: если startInCreate=true — сразу в режиме создания, минуя плейсхолдер
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>(startInCreate ? 'create' : 'view');
  const [draft, setDraft] = useState<AppointmentFormDraft>({
    ...EMPTY_DRAFT,
    patient: createInitialPatient,
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelDraft, setCancelDraft] = useState<AppointmentCancelDraft>(EMPTY_CANCEL_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lifecycle, setLifecycle] = useState<LifecycleResponse | null>(null);
  const [primaryComment, setPrimaryComment] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);
  const createManualRequestIdRef = useRef(crypto.randomUUID());
  const selectedId = selected?.id ?? null;

  const patchDraft = (patch: Partial<AppointmentFormDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (mode === 'create') {
      createManualRequestIdRef.current = crypto.randomUUID();
      onCreateDirtyChange?.(true);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void fetch(`${apiBase}/appointments/${encodeURIComponent(selectedId)}/lifecycle`)
      .then((res) => res.json())
      .then((json: LifecycleResponse) => {
        if (!cancelled && json.ok) setLifecycle(json);
      })
      .catch(() => {
        if (!cancelled) setLifecycle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, selectedId]);

  const loadPrimaryComment = useCallback(async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`${apiBase}/appointments/${encodeURIComponent(selectedId)}/comments`);
      const json = (await res.json()) as { ok?: boolean; comments?: AppointmentCommentRow[] };
      if (!json.ok) return;
      // Порт отдаёт комментарии от новых к старым: основной — самый свежий.
      const body = json.comments?.[0]?.body ?? '';
      setPrimaryComment(body);
      setCommentDraft(body);
    } catch {
      /* карточка остаётся читаемой и без комментария */
    }
  }, [apiBase, selectedId]);

  useEffect(() => {
    void loadPrimaryComment();
  }, [loadPrimaryComment]);

  // §3.6: при startInCreate=true инициализируем поля создания сразу, как делает openCreateForm
  useEffect(() => {
    if (!startInCreate) return;
    const nextSpecialistId =
      resolveCalendarCreateFieldValue(
        filterMeta.specialists,
        activeFilters.specialistId,
        createInitialSpecialistId,
      ) ??
      filterMeta.specialists[0]?.id ??
      null;
    const nextBranchId =
      createInitialBranchId ??
      resolveCalendarCreateFieldValue(filterMeta.branches, activeFilters.branchId, null);
    const initialServiceId =
      createInitialServiceId ??
      resolveCalendarCreateFieldValue(filterMeta.services, activeFilters.serviceId, null);
    const initialServices = listCreateServicesForSelection(
      filterMeta.services,
      nextSpecialistId,
      nextBranchId,
    );
    const serviceId = initialServices.some((service) => service.id === initialServiceId)
      ? initialServiceId
      : null;
    const dragMinutes = dragDurationMinutes(createInitialStart, createInitialEnd);
    const serviceMinutes = serviceId
      ? (initialServices.find((service) => service.id === serviceId)?.durationMinutes ?? null)
      : null;
    setDraft({
      ...EMPTY_DRAFT,
      // R32: подставить выделенное время старта (если открыто через select по сетке)
      start: createInitialStart ?? '',
      // #225: длительность выделения приоритетнее услуги — врач уже выбрал размер слота.
      durationMinutes: dragMinutes ?? serviceMinutes,
      specialistId: nextSpecialistId,
      branchId: nextBranchId,
      serviceId,
      patient: createInitialPatient,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startInCreate,
    createInitialStart,
    createInitialEnd,
    createInitialBranchId,
    createInitialServiceId,
    createInitialSpecialistId,
    createInitialPatient,
  ]);

  useEffect(() => {
    if (mode !== 'create') onCreateDirtyChange?.(false);
  }, [mode, onCreateDirtyChange]);

  const draftServiceOptions = useMemo(
    () => listCreateServicesForSelection(filterMeta.services, draft.specialistId, draft.branchId),
    [draft.branchId, draft.specialistId, filterMeta.services],
  );

  /**
   * Скрыть выбор специалиста можно только против серверного каталога клиники;
   * без него поле остаётся видимым (APPT-FORM-07).
   */
  const hideSpecialist = clinicSpecialists != null && clinicSpecialists.length <= 1;

  const submitCreate = () => {
    const submission = resolveCalendarCreateSubmission({
      start: draft.start,
      durationMinutes: draft.durationMinutes,
      specialistId: draft.specialistId,
      branchId: draft.branchId,
      serviceId: draft.serviceId,
      serviceIsOffered: draftServiceOptions.some((service) => service.id === draft.serviceId),
    });
    if (!submission.ok) {
      setMessage(submission.message);
      return;
    }
    const start = parseFormStart(submission.start, timeZone);
    if (!start.isValid) {
      setMessage('Укажите начало записи.');
      return;
    }
    const startAt = start.toUTC().toISO()!;
    const endAt = start.plus({ minutes: submission.durationMinutes }).toUTC().toISO()!;
    const patient = draft.patient;
    if (patient?.isNew === true && (!patient.lastName?.trim() || !patient.firstName?.trim())) {
      setMessage('Укажите фамилию и имя пациента.');
      return;
    }
    startTransition(async () => {
      const isNewPatient = patient?.isNew === true;
      const res = await fetch(
        isNewPatient
          ? `${apiBase}/appointments/manual-patient-visit`
          : `${apiBase}/appointments/manual`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(isNewPatient
              ? {
                  requestId: createManualRequestIdRef.current,
                  kind: 'scheduled',
                  lastName: patient.lastName,
                  firstName: patient.firstName,
                  patronymic: patient.patronymic ?? null,
                  phone: patient.phone,
                  email: patient.email ?? null,
                }
              : {
                  platformUserId: patient?.id ?? null,
                  phoneNormalized: patient?.phone?.trim() || null,
                }),
            startAt,
            endAt,
            durationMinutes: submission.durationMinutes,
            specialistId: submission.specialistId,
            branchId: submission.branchId,
            serviceId: submission.serviceId,
          }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        appointment?: { id?: string };
      };
      setMessage(json.ok ? 'Создано' : (json.message ?? panelErrorLabel(json.error)));
      if (json.ok) {
        createManualRequestIdRef.current = crypto.randomUUID();
        // R16: после создания (есть id) добавляем комментарий записи отдельным запросом.
        const newId = json.appointment?.id;
        if (newId && draft.comment.trim()) {
          await fetch(`${apiBase}/appointments/${encodeURIComponent(newId)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: draft.comment.trim() }),
          }).catch(() => undefined);
        }
        setMode('view');
        onChanged();
      } else if (json.error === 'external_slot_taken') {
        onChanged();
      }
    });
  };

  if (!selected) {
    if (mode !== 'create') {
      return (
        <div
          className={cn(
            doctorClientOverviewPrimaryCardClass,
            flushChrome && 'rounded-none border-0 bg-transparent p-0 shadow-none',
          )}
        >
          <p className="text-sm text-muted-foreground">Выберите событие в календаре.</p>
        </div>
      );
    }
    return (
      <div
        className={cn(
          doctorClientOverviewPrimaryCardClass,
          flushChrome && 'rounded-none border-0 bg-transparent p-0 shadow-none',
        )}
      >
        <DoctorAppointmentForm
          mode="create"
          draft={draft}
          onDraftChange={patchDraft}
          filterMeta={filterMeta}
          serviceOptions={draftServiceOptions}
          activeFilters={activeFilters}
          hideSpecialist={hideSpecialist}
          patientLocked={false}
          statusOptions={[]}
          pending={pending}
          message={message}
        />
        <DoctorModalFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={submitCreate}>
            Сохранить
          </Button>
        </DoctorModalFooter>
      </div>
    );
  }

  const statusLabel = appointmentStatusLabel(selected.status);
  const cancelled = isCancelledAppointmentStatus(selected.status);
  const durationMinutes = eventDurationMinutes(selected, timeZone);
  const specialistOption: CalendarFilterOption | null = selected.specialistId
    ? (filterMeta.specialists.find((option) => option.id === selected.specialistId) ?? {
        id: selected.specialistId,
        label: selected.specialistName ?? '—',
      })
    : null;
  const editFilterMeta: CalendarFilterMeta = {
    ...filterMeta,
    // Перенос на другого специалиста контрактом не поддержан — поле только читается.
    specialists: specialistOption ? [specialistOption] : [],
  };
  const editServiceOptions = (() => {
    const options = listCreateServicesForSelection(
      filterMeta.services,
      draft.specialistId,
      draft.branchId,
    );
    if (!selected.serviceId || options.some((service) => service.id === selected.serviceId)) {
      return options;
    }
    const current = filterMeta.services.find((service) => service.id === selected.serviceId);
    return current ? [current, ...options] : options;
  })();
  const statusOptions: AppointmentStatusOption[] = cancelled
    ? [{ value: selected.status, label: statusLabel }]
    : [
        { value: selected.status, label: statusLabel },
        { value: 'no_show', label: appointmentStatusLabel('no_show') },
      ];

  const openEditForm = () => {
    const start = parseEventDateTime(selected.startAt, timeZone);
    setMessage(null);
    setDraft({
      start: start.isValid ? start.toFormat(FORM_START_FORMAT) : '',
      durationMinutes,
      specialistId: selected.specialistId,
      branchId: selected.branchId,
      serviceId: selected.serviceId,
      patient: {
        id: selected.platformUserId,
        displayName: selected.patientName ?? 'Пациент',
        phone: selected.patientPhone,
      },
      comment: primaryComment,
      status: selected.status,
    });
    setMode('edit');
  };

  const submitEdit = () => {
    const start = parseFormStart(draft.start, timeZone);
    if (!start.isValid) {
      setMessage('Укажите начало записи.');
      return;
    }
    const nextDurationMinutes = draft.durationMinutes;
    if (!nextDurationMinutes || nextDurationMinutes <= 0) {
      setMessage('Укажите длительность.');
      return;
    }
    if (!draft.branchId || !draft.serviceId) {
      setMessage('Укажите филиал и услугу.');
      return;
    }
    const currentStart = parseEventDateTime(selected.startAt, timeZone);
    const scheduleChanged =
      !currentStart.isValid ||
      currentStart.toMillis() !== start.toMillis() ||
      nextDurationMinutes !== durationMinutes ||
      draft.branchId !== selected.branchId ||
      draft.serviceId !== selected.serviceId;
    const commentChanged = draft.comment.trim() !== primaryComment.trim();
    const statusChanged = draft.status !== null && draft.status !== selected.status;

    startTransition(async () => {
      if (scheduleChanged) {
        const res = await fetch(
          `${apiBase}/appointments/${encodeURIComponent(selected.id)}/manual-reschedule`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              newStartAt: start.toUTC().toISO(),
              newEndAt: start.plus({ minutes: nextDurationMinutes }).toUTC().toISO(),
              durationMinutes: nextDurationMinutes,
              branchId: draft.branchId,
              serviceId: draft.serviceId,
            }),
          },
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) {
          setMessage(panelErrorLabel(json.error));
          if (json.error === 'external_slot_taken') onChanged();
          return;
        }
      }
      if (commentChanged && draft.comment.trim()) {
        await fetch(`${apiBase}/appointments/${encodeURIComponent(selected.id)}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: draft.comment.trim() }),
        }).catch(() => undefined);
      }
      if (statusChanged && draft.status === 'no_show') {
        const res = await fetch(
          `${apiBase}/appointments/${encodeURIComponent(selected.id)}/manual-no-show`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) {
          setMessage(panelErrorLabel(json.error));
          return;
        }
      }
      setMessage('Сохранено');
      setMode('view');
      onChanged();
    });
  };

  const submitPrimaryComment = () => {
    const body = commentDraft.trim();
    if (!body || body === primaryComment.trim()) return;
    setCommentSaving(true);
    void (async () => {
      try {
        const res = await fetch(
          `${apiBase}/appointments/${encodeURIComponent(selected.id)}/comments`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
          },
        );
        const json = (await res.json()) as { ok?: boolean };
        if (!json.ok) {
          setMessage('Не удалось сохранить комментарий.');
          return;
        }
        await loadPrimaryComment();
      } finally {
        setCommentSaving(false);
      }
    })();
  };

  const confirmCancel = () => {
    startTransition(async () => {
      const res = await fetch(
        `${apiBase}/appointments/${encodeURIComponent(selected.id)}/manual-cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decisionType: cancelDraft.charge,
            ...(cancelDraft.reason ? { reason: cancelDraft.reason } : {}),
            ...(cancelDraft.comment.trim() ? { staffComment: cancelDraft.comment.trim() } : {}),
            notifyPatient: cancelDraft.notify,
          }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      setMessage(json.ok ? 'Отменено' : panelErrorLabel(json.error));
      if (json.ok) {
        setCancelOpen(false);
        onChanged();
      }
    });
  };

  const deleteCancelled = () => {
    // R22: удаление уже отменённой записи — пациенту не уведомляем (purge без side-effects).
    if (!window.confirm('Удалить запись из календаря и кабинета пациента?')) return;
    startTransition(async () => {
      const res = await fetch(`${apiBase}/appointments/${encodeURIComponent(selected.id)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      setMessage(json.ok ? 'Удалено' : panelErrorLabel(json.error));
      if (json.ok) onChanged();
    });
  };

  if (mode === 'edit') {
    return (
      <div
        className={cn(
          doctorClientOverviewPrimaryCardClass,
          flushChrome && 'rounded-none border-0 bg-transparent p-0 shadow-none',
        )}
      >
        <DoctorAppointmentForm
          mode="edit"
          draft={draft}
          onDraftChange={patchDraft}
          filterMeta={editFilterMeta}
          serviceOptions={editServiceOptions}
          activeFilters={activeFilters}
          hideSpecialist={hideSpecialist}
          patientLocked
          statusOptions={statusOptions}
          pending={pending}
          message={message}
        />
        <DoctorModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setMessage(null);
              setMode('view');
            }}
          >
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={submitEdit}>
            Сохранить
          </Button>
        </DoctorModalFooter>
      </div>
    );
  }

  const hasRealOriginalStart = Boolean(
    selected.originalStartAt &&
    isDifferentCalendarMinute(selected.originalStartAt, selected.startAt, timeZone),
  );
  const relevantReschedules = (lifecycle?.reschedules ?? []).filter(
    (r) =>
      isSameCalendarMinute(r.toStartAt, selected.startAt, timeZone) ||
      isSameCalendarMinute(r.fromStartAt, selected.startAt, timeZone) ||
      (selected.originalStartAt
        ? isSameCalendarMinute(r.fromStartAt, selected.originalStartAt, timeZone)
        : false),
  );
  const patientName = selected.patientName ?? 'Пациент';
  const visitHref = selected.platformUserId
    ? patientCardHref(selected.platformUserId, {
        tab: 'karta',
        createVisitFrom: selected.id,
        visitDate: selected.startAt ? selected.startAt.slice(0, 10) : undefined,
      })
    : null;

  return (
    <div
      className={cn(
        doctorClientOverviewPrimaryCardClass,
        flushChrome && 'rounded-none border-0 bg-transparent p-0 shadow-none',
      )}
    >
      <div
        data-testid="appointment-detail-header"
        className="flex items-start justify-between gap-3"
      >
        <p className={doctorMetricValueClass}>{formatEventAtWords(selected.startAt, timeZone)}</p>
        <Badge
          variant="outline"
          className={cn(
            'h-7 shrink-0 rounded-full px-3 text-sm font-medium',
            appointmentStatusToneClass(selected.status),
          )}
        >
          {statusLabel}
        </Badge>
      </div>
      {hasRealOriginalStart && selected.originalStartAt ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Исходное время: {formatEventAt(selected.originalStartAt, timeZone)}
        </p>
      ) : null}

      <p className="mt-2 text-base font-semibold leading-snug text-foreground">
        {selected.platformUserId ? (
          <Link
            href={patientCardHref(selected.platformUserId)}
            className="text-primary underline-offset-2 hover:underline"
          >
            {patientName}
          </Link>
        ) : (
          patientName
        )}
      </p>

      <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
        <dl className="space-y-2">
          <div>
            <dt className="text-xs text-muted-foreground">Филиал</dt>
            <dd>{selected.branchTitle ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Услуга</dt>
            <dd>{selected.serviceTitle ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Длительность</dt>
            <dd>{durationMinutes != null ? `${durationMinutes} мин` : '—'}</dd>
          </div>
          {!hideSpecialist ? (
            <div>
              <dt className="text-xs text-muted-foreground">Специалист</dt>
              <dd>{selected.specialistName ?? '—'}</dd>
            </div>
          ) : null}
          {selected.roomTitle ? (
            <div>
              <dt className="text-xs text-muted-foreground">Кабинет</dt>
              <dd>{selected.roomTitle}</dd>
            </div>
          ) : null}
        </dl>
        {selected.prepaymentPending ? <Badge variant="secondary">Ожидает предоплаты</Badge> : null}
        {selected.packageUsageRef || selected.packageTitle ? (
          <Badge
            variant="secondary"
            className="border border-violet-500/30 bg-violet-500/15 text-violet-900"
            title={selected.packageTitle ?? undefined}
          >
            {formatPatientPackageShortLabel(selected.packageDisplayNumber)}
          </Badge>
        ) : null}
        {selected.paymentStatus ? (
          <Badge variant="secondary">Оплата: {paymentStatusLabel(selected.paymentStatus)}</Badge>
        ) : null}
        {selected.rescheduleCount > 0 ? (
          <p className="text-xs text-muted-foreground">Переносов: {selected.rescheduleCount}</p>
        ) : null}
        {selected.formComments.map((c) => (
          <p key={c.label} className="text-xs">
            {c.label}: {c.value}
          </p>
        ))}

        {/* APPT-DETAIL-07: один основной комментарий записи, до блока оплаты. */}
        <div className="flex flex-col gap-1">
          <Label htmlFor="appointment-primary-comment">Комментарий</Label>
          <Textarea
            id="appointment-primary-comment"
            value={commentDraft}
            disabled={commentSaving}
            aria-label="Комментарий к записи"
            onChange={(event) => setCommentDraft(event.target.value)}
          />
          {commentDraft.trim() !== primaryComment.trim() ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              disabled={commentSaving || !commentDraft.trim()}
              onClick={submitPrimaryComment}
            >
              Сохранить
            </Button>
          ) : null}
        </div>

        {selected.platformUserId ? (
          <AppointmentPaymentSection
            apiBase={apiBase}
            appointmentId={selected.id}
            patientUserId={selected.platformUserId}
          />
        ) : null}

        {relevantReschedules.length ? (
          <div className="space-y-1 border-t border-border pt-2">
            {relevantReschedules.map((r) => (
              <p key={r.id} className="text-xs text-muted-foreground">
                Перенос: {formatEventAt(r.fromStartAt, timeZone)} →{' '}
                {formatEventAt(r.toStartAt, timeZone)}
                {r.staffComment ? ` · ${r.staffComment}` : ''}
              </p>
            ))}
          </div>
        ) : null}
        {lifecycle?.cancellations.length ? (
          <div className="space-y-1">
            {lifecycle.cancellations.map((c) => (
              <p key={c.id} className="text-xs text-muted-foreground">
                Отмена ({cancellationDecisionTypeLabel(c.cancellationType)})
                {c.staffComment ? `: ${c.staffComment}` : ''}
              </p>
            ))}
          </div>
        ) : null}
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>

      {/* APPT-DETAIL-08: «Изменить», «Отменить», «Создать визит» — в общем футере модалки. */}
      <DoctorModalFooter>
        {cancelled ? (
          <>
            {canUseOwnSpecialistAppointmentActions(ownSpecialistId, selected.specialistId) &&
            isStaffDeletableCancelledStatus(selected.status) ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={pending}
                onClick={deleteCancelled}
              >
                Удалить
              </Button>
            ) : null}
            {visitHref ? (
              <Link href={visitHref} className={buttonVariants()}>
                Создать визит
              </Link>
            ) : (
              <Button type="button" disabled>
                Создать визит
              </Button>
            )}
          </>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={pending} onClick={openEditForm}>
              Изменить
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                setMessage(null);
                setCancelOpen(true);
              }}
            >
              Отменить
            </Button>
            {visitHref ? (
              <Link href={visitHref} className={buttonVariants()}>
                Создать визит
              </Link>
            ) : (
              <Button type="button" disabled>
                Создать визит
              </Button>
            )}
          </>
        )}
      </DoctorModalFooter>

      <DoctorAppointmentCancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        whenLabel={formatEventAtWords(selected.startAt, timeZone)}
        patientLabel={patientName}
        draft={cancelDraft}
        onDraftChange={(patch) => setCancelDraft((current) => ({ ...current, ...patch }))}
        pending={pending}
        message={message}
        onConfirm={confirmCancel}
      />
    </div>
  );
}

/** #225: длительность выделения в сетке (конец − начало) в минутах. */
function dragDurationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60_000);
}
