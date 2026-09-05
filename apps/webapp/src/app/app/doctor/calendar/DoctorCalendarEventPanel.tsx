'use client';

import Link from 'next/link';
import { patientCardHref } from '../patients/patientCardHref';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import {
  DoctorModal,
  DoctorModalFooter,
  DoctorModalStackedTitle,
} from '@/shared/ui/doctor/DoctorModal';
import {
  doctorBodyTextClass,
  doctorInlineMetricValueClass,
  doctorSecondaryListTextClass,
} from '@/shared/ui/doctor/doctorVisual';
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
  /** Обновляет открытую карточку после правки, не закрывая первый слой модалки. */
  onUpdated?: (appointment?: CalendarAppointmentEvent) => void;
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

function formatRescheduleCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} переносов`;
  if (mod10 === 1) return `${count} перенос`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} переноса`;
  return `${count} переносов`;
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
  onUpdated,
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
  // APPT-FORM-13: правка идёт двумя контрактами (запись и комментарий). Отказ комментария
  // обязан оставить форму с ошибкой на экране, поэтому обновление календаря откладывается
  // до ухода из формы — `onChanged` закрывает панель и стёр бы сообщение.
  const [pendingRefresh, setPendingRefresh] = useState(false);
  // ...и уже применённые шаги запоминаются: повторное «Сохранить» после отказа комментария
  // не переносит запись второй раз.
  const appliedEditRef = useRef<{ id: string; schedule: string | null; status: string | null }>({
    id: '',
    schedule: null,
    status: null,
  });
  const [pending, startTransition] = useTransition();
  const [lifecycle, setLifecycle] = useState<LifecycleResponse | null>(null);
  // APPT-DETAIL-11: комментарий приезжает вместе с деталями записи. Отдельная загрузка рисовала
  // пустое поле первым кадром, и открытое сразу «Изменить» уносило в форму пустой черновик
  // поверх существующего текста.
  const initialComment = selected?.primaryComment ?? '';
  const [primaryComment, setPrimaryComment] = useState(initialComment);
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

  /**
   * Основной комментарий записи (APPT-DETAIL-07): один и тот же контракт и пишет текст, и
   * снимает его пустым значением. Возвращает `false`, если сервер отказал, — вызывающий обязан
   * не показывать успех и не терять набранный пользователем текст (APPT-FORM-13).
   */
  const savePrimaryComment = useCallback(
    async (appointmentId: string, body: string): Promise<boolean> => {
      const url = `${apiBase}/appointments/${encodeURIComponent(appointmentId)}/comments`;
      try {
        const res = await fetch(
          url,
          body
            ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body }),
              }
            : { method: 'DELETE' },
        );
        const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        return res.ok && json?.ok === true;
      } catch {
        return false;
      }
    },
    [apiBase],
  );

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
   * Скрыть выбор специалиста можно только когда сервер доказал, что специалист в клинике
   * ровно один (APPT-FORM-07). Ноль доступных специалистов — не «единственный»: поле остаётся
   * с честным пустым состоянием, иначе исправить нечем.
   */
  const hideSpecialist = clinicSpecialists != null && clinicSpecialists.length === 1;

  const submitCreate = () => {
    setMessage(null);
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
    if (patient?.isNew === true && !patient.firstName?.trim()) {
      setMessage('Укажите имя пациента.');
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
                  lastName: patient.lastName?.trim() || null,
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
      if (!json.ok) {
        toast.error(json.message ?? panelErrorLabel(json.error));
        if (json.error === 'external_slot_taken') onChanged();
        return;
      }
      // R16: после создания (есть id) комментарий записи уходит отдельным запросом. Его отказ
      // не имеет права выглядеть как полный успех: форма остаётся с набранным текстом, а
      // requestId не обновляется — повторное «Сохранить» воспроизводит ту же запись и
      // повторяет комментарий, а не создаёт вторую (APPT-FORM-13).
      const newId = json.appointment?.id;
      const commentBody = draft.comment.trim();
      const commentSaved = !commentBody
        ? true
        : newId
          ? await savePrimaryComment(newId, commentBody)
          : false;
      if (!commentSaved) {
        toast.error('Запись создана, комментарий не сохранён.');
        setPendingRefresh(true);
        return;
      }
      createManualRequestIdRef.current = crypto.randomUUID();
      toast.success('Создано');
      setMode('view');
      onChanged();
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
          statusOptions={[]}
          pending={pending}
          message={message}
        />
        <DoctorModalFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={pendingRefresh ? onChanged : onClose}
          >
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
    setMessage(null);
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
      setMessage('Укажите филиал и сеанс.');
      return;
    }
    const currentStart = parseEventDateTime(selected.startAt, timeZone);
    const startChanged = !currentStart.isValid || currentStart.toMillis() !== start.toMillis();
    const nextPatientId = draft.patient?.id ?? null;
    const patientChanged = nextPatientId !== selected.platformUserId;
    const scheduleChanged =
      !currentStart.isValid ||
      currentStart.toMillis() !== start.toMillis() ||
      nextDurationMinutes !== durationMinutes ||
      draft.branchId !== selected.branchId ||
      draft.serviceId !== selected.serviceId ||
      patientChanged;
    const commentChanged = draft.comment.trim() !== primaryComment.trim();
    const statusChanged = draft.status !== null && draft.status !== selected.status;
    const applied =
      appliedEditRef.current.id === selected.id
        ? appliedEditRef.current
        : { id: selected.id, schedule: null, status: null };
    appliedEditRef.current = applied;
    const scheduleSignature = JSON.stringify([
      start.toUTC().toISO(),
      nextDurationMinutes,
      draft.branchId,
      draft.serviceId,
      nextPatientId,
    ]);

    startTransition(async () => {
      if (scheduleChanged && applied.schedule !== scheduleSignature) {
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
              // APPT-FORM-13: пациента меняет тот же lifecycle-контракт, отдельного endpoint нет.
              ...(patientChanged ? { platformUserId: nextPatientId } : {}),
            }),
          },
        );
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!json.ok) {
          toast.error(panelErrorLabel(json.error));
          if (json.error === 'external_slot_taken') onChanged();
          return;
        }
        applied.schedule = scheduleSignature;
        setPendingRefresh(true);
      }
      if (statusChanged && draft.status === 'no_show' && applied.status !== draft.status) {
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
          toast.error(panelErrorLabel(json.error));
          return;
        }
        applied.status = draft.status;
        setPendingRefresh(true);
      }
      // Комментарий идёт последним и через тот же контракт, что и очистка: пока он не сохранён,
      // объявлять запись сохранённой нельзя — иначе набранный текст пропадает молча.
      if (commentChanged && !(await savePrimaryComment(selected.id, draft.comment.trim()))) {
        toast.error('Комментарий не сохранён.');
        return;
      }
      const nextStartAt = start.toUTC().toISO() ?? selected.startAt;
      const nextEndAt =
        start.plus({ minutes: nextDurationMinutes }).toUTC().toISO() ?? selected.endAt;
      const nextBranch = filterMeta.branches.find((branch) => branch.id === draft.branchId);
      const nextService = filterMeta.services.find((service) => service.id === draft.serviceId);
      const updatedAppointment: CalendarAppointmentEvent = {
        ...selected,
        startAt: nextStartAt,
        endAt: nextEndAt,
        status: statusChanged && draft.status === 'no_show' ? 'no_show' : selected.status,
        branchId: draft.branchId,
        branchTitle: nextBranch?.label ?? selected.branchTitle,
        branchColor: nextBranch?.color ?? selected.branchColor,
        serviceId: draft.serviceId,
        serviceTitle: nextService?.label ?? selected.serviceTitle,
        platformUserId: draft.patient?.id ?? selected.platformUserId,
        patientName: draft.patient?.displayName ?? selected.patientName,
        patientPhone: draft.patient?.phone ?? selected.patientPhone,
        originalStartAt:
          startChanged && !selected.originalStartAt ? selected.startAt : selected.originalStartAt,
        rescheduleCount: startChanged ? selected.rescheduleCount + 1 : selected.rescheduleCount,
      };
      setPrimaryComment(draft.comment.trim());
      setPendingRefresh(false);
      toast.success('Изменения сохранены');
      setMode('view');
      if (onUpdated) onUpdated(updatedAppointment);
      else onChanged();
    });
  };

  const closeEditForm = () => {
    if (pending) return;
    setMessage(null);
    setMode('view');
    if (!pendingRefresh) return;
    setPendingRefresh(false);
    if (onUpdated) onUpdated();
    else onChanged();
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
      if (!json.ok) {
        toast.error(panelErrorLabel(json.error));
        return;
      }
      toast.success('Отменено');
      setCancelOpen(false);
      onChanged();
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
      if (!json.ok) {
        toast.error(panelErrorLabel(json.error));
        return;
      }
      toast.success('Удалено');
      onChanged();
    });
  };

  const hasRealOriginalStart = Boolean(
    selected.originalStartAt &&
    isDifferentCalendarMinute(selected.originalStartAt, selected.startAt, timeZone),
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
        <p className={doctorInlineMetricValueClass}>
          {formatEventAtWords(selected.startAt, timeZone)}
        </p>
        <Badge
          variant="outline"
          className={cn(
            'h-5 shrink-0 rounded-full px-2 text-xs font-medium',
            appointmentStatusToneClass(selected.status),
          )}
        >
          {statusLabel}
        </Badge>
      </div>
      {hasRealOriginalStart && selected.originalStartAt ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Перенос с {formatEventAt(selected.originalStartAt, timeZone)}
          {selected.rescheduleCount > 1
            ? ` (${formatRescheduleCount(selected.rescheduleCount)})`
            : ''}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        <dl className="space-y-3">
          <div>
            <dt className={doctorSecondaryListTextClass}>Филиал</dt>
            <dd className={doctorBodyTextClass}>{selected.branchTitle ?? '—'}</dd>
          </div>
          {!hideSpecialist ? (
            <div>
              <dt className={doctorSecondaryListTextClass}>Специалист</dt>
              <dd className={doctorBodyTextClass}>{selected.specialistName ?? '—'}</dd>
            </div>
          ) : null}
          <div>
            <dt className={doctorSecondaryListTextClass}>Услуга</dt>
            <dd className={doctorBodyTextClass}>{selected.serviceTitle ?? '—'}</dd>
          </div>
          <div>
            <dt className={doctorSecondaryListTextClass}>Длительность</dt>
            <dd className={doctorBodyTextClass}>
              {durationMinutes != null ? `${durationMinutes} мин` : '—'}
            </dd>
          </div>
          {selected.roomTitle ? (
            <div>
              <dt className={doctorSecondaryListTextClass}>Кабинет</dt>
              <dd className={doctorBodyTextClass}>{selected.roomTitle}</dd>
            </div>
          ) : null}
          {selected.formComments.map((comment) => (
            <div key={comment.label}>
              <dt className={doctorSecondaryListTextClass}>{comment.label}</dt>
              <dd className={doctorBodyTextClass}>{comment.value}</dd>
            </div>
          ))}
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

        {/* Просмотр остаётся read-only; основной комментарий правится общей формой «Изменить». */}
        <div>
          <p className={doctorSecondaryListTextClass}>Комментарий</p>
          <p
            className={cn(
              doctorBodyTextClass,
              'whitespace-pre-wrap',
              !primaryComment.trim() && 'text-muted-foreground',
            )}
          >
            {primaryComment.trim() || '—'}
          </p>
        </div>

        {selected.platformUserId && selected.payment ? (
          <AppointmentPaymentSection
            apiBase={apiBase}
            appointmentId={selected.id}
            view={selected.payment}
            patientUserId={selected.platformUserId}
          />
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
              onClick={() => setCancelOpen(true)}
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
        patientHref={selected.platformUserId ? patientCardHref(selected.platformUserId) : null}
        draft={cancelDraft}
        onDraftChange={(patch) => setCancelDraft((current) => ({ ...current, ...patch }))}
        pending={pending}
        onConfirm={confirmCancel}
      />

      <DoctorModal
        open={mode === 'edit'}
        onClose={closeEditForm}
        title={
          <DoctorModalStackedTitle
            label="Изменить запись"
            patientName={patientName}
            patientHref={selected.platformUserId ? patientCardHref(selected.platformUserId) : null}
          />
        }
        size="lg"
        desktopPresentation="right-sheet"
        nested
      >
        <DoctorAppointmentForm
          mode="edit"
          draft={draft}
          onDraftChange={patchDraft}
          filterMeta={editFilterMeta}
          serviceOptions={editServiceOptions}
          activeFilters={activeFilters}
          hideSpecialist={hideSpecialist}
          hidePatient={Boolean(selected.platformUserId)}
          statusOptions={statusOptions}
          pending={pending}
          message={message}
        />
        <DoctorModalFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={closeEditForm}>
            Отмена
          </Button>
          <Button type="button" disabled={pending} onClick={submitEdit}>
            Сохранить
          </Button>
        </DoctorModalFooter>
      </DoctorModal>
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
