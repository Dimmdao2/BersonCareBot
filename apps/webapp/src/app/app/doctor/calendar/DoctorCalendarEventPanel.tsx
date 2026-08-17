'use client';

import Link from 'next/link';
import { patientCardHref } from '../patients/patientCardHref';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { MessageCircle, Phone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import {
  doctorClientOverviewPrimaryCardClass,
  doctorClientSectionTitleClass,
} from '../clients/doctorClientCardChrome';
import type {
  CalendarAppointmentEvent,
  CalendarFilterMeta,
  CalendarServiceFilterOption,
} from '@/modules/booking-calendar/types';
import type { CalendarCreateActiveFilters } from '@/modules/booking-calendar/calendarCreateFieldMode';
import {
  resolveCalendarCreateFieldMode,
  resolveCalendarCreateFieldValue,
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
import { AppointmentStaffCommentsSection } from '@/app/app/doctor/clients/AppointmentStaffCommentsSection';
import { DoctorOpenChatButton } from '@/shared/ui/doctor/DoctorOpenChatButton';
import { phoneToTelHref } from '@/shared/lib/phoneLinks';
import {
  DoctorCalendarPatientSearch,
  type CalendarPatientOption,
} from './DoctorCalendarPatientSearch';
import { DoctorCalendarCreateFormField } from './DoctorCalendarCreateFormField';
import { DoctorDateTimePicker } from '@/shared/ui/doctor/DoctorDateTimePicker';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import { canUseOwnSpecialistAppointmentActions } from '@/modules/doctor-schedule/scope';

// R21: причины отмены, отправляемые как reason в API.
const CANCEL_REASONS = [
  { value: 'Пациент перенёс', label: 'Пациент перенёс' },
  { value: 'Пациент отменил', label: 'Пациент отменил' },
  { value: 'Не пришёл', label: 'Не пришёл' },
  { value: 'По состоянию здоровья', label: 'По состоянию здоровья' },
  { value: 'Другая', label: 'Другая' },
] as const;

// R21: бесплатная/штрафная → decisionType API.
const CANCEL_CHARGE = [
  { value: 'free', label: 'Бесплатная' },
  { value: 'penalized', label: 'Штрафная' },
] as const;

// R20: классификация уже отменённой записи (бесплатная/платная) — пока нефункц. плейсхолдер.
const POST_CANCEL_CLASS = [
  { value: 'free', label: 'Бесплатная' },
  { value: 'paid', label: 'Платная' },
] as const;

type Props = {
  apiBase: string;
  selected: CalendarAppointmentEvent | null;
  timeZone: string;
  filterMeta: CalendarFilterMeta;
  activeFilters: CalendarCreateActiveFilters;
  ownSpecialistId: string | null;
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
  onCreateDirtyChange?: (dirty: boolean) => void;
  /** Dialog hosts keep their standard close; embedded schedule keeps this panel close. */
  showCloseControl?: boolean;
};

type LifecycleResponse = {
  ok: boolean;
  reschedules: AppointmentRescheduleRecord[];
  cancellations: AppointmentCancellationRecord[];
};

function formatEventAt(iso: string, timeZone: string): string {
  // R27: originalStartAt приходит из canonical-порта в Postgres timestamptz формате
  // ("2026-06-13 10:00:00+02", пробел вместо "T") — строгий fromISO даёт Invalid.
  // Парсим терпимо: ISO → SQL → нативный Date.
  let dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromSQL(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromJSDate(new Date(iso));
  if (!dt.isValid) return '—';
  return dt.setZone(timeZone).toFormat('dd.MM.yyyy HH:mm');
}

function parseEventDateTime(iso: string, timeZone: string): DateTime {
  let dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromSQL(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromJSDate(new Date(iso));
  return dt.isValid ? dt.setZone(timeZone).startOf('minute') : dt;
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

function noneValue() {
  return '__none__';
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
  onClose,
  onChanged,
  startInCreate = false,
  createInitialStart = null,
  createInitialEnd = null,
  createInitialBranchId = null,
  createInitialServiceId = null,
  createInitialSpecialistId = null,
  onCreateDirtyChange,
  showCloseControl = true,
}: Props) {
  // §3.6: если startInCreate=true — сразу в режиме создания, минуя плейсхолдер
  const [mode, setMode] = useState<'view' | 'create' | 'reschedule' | 'cancel'>(
    startInCreate ? 'create' : 'view',
  );
  // R20: классификация уже отменённой записи (бесплатная/платная) — нефункц. плейсхолдер
  const [postCancelClass, setPostCancelClass] = useState('free');
  // R21: поля формы отмены
  const [cancelReason, setCancelReason] = useState('');
  const [cancelComment, setCancelComment] = useState('');
  const [cancelCharge, setCancelCharge] = useState('free');
  const [cancelNotify, setCancelNotify] = useState(true);
  const [newStartLocal, setNewStartLocal] = useState('');
  const [newEndLocal, setNewEndLocal] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [lifecycle, setLifecycle] = useState<LifecycleResponse | null>(null);
  const [phoneCopied, setPhoneCopied] = useState(false);

  const [createStart, setCreateStart] = useState('');
  const [createSpecialistId, setCreateSpecialistId] = useState<string | null>(null);
  const [createBranchId, setCreateBranchId] = useState<string | null>(null);
  const [createServiceId, setCreateServiceId] = useState<string | null>(null);
  const [createPatient, setCreatePatient] = useState<CalendarPatientOption | null>(null);
  const createManualRequestIdRef = useRef(crypto.randomUUID());
  // R16: комментарий, добавляемый сразу после создания записи (staff-коммент).
  const [createComment, setCreateComment] = useState('');
  const selectedId = selected?.id ?? null;

  async function copyPatientPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setPhoneCopied(true);
    } catch {
      // The number remains visible when clipboard permission is unavailable.
    }
  }

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
    setCreateSpecialistId(nextSpecialistId);
    setCreateBranchId(nextBranchId);
    setCreateServiceId(
      initialServices.some((service) => service.id === initialServiceId) ? initialServiceId : null,
    );
    // R32: подставить выделенное время старта (если открыто через select по сетке)
    if (createInitialStart) setCreateStart(createInitialStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startInCreate,
    createInitialStart,
    createInitialBranchId,
    createInitialServiceId,
    createInitialSpecialistId,
  ]);

  useEffect(() => {
    if (mode !== 'create') onCreateDirtyChange?.(false);
  }, [mode, onCreateDirtyChange]);

  const markCreateDirty = () => {
    createManualRequestIdRef.current = crypto.randomUUID();
    onCreateDirtyChange?.(true);
  };

  const createServiceOptions = useMemo(
    () => listCreateServicesForSelection(filterMeta.services, createSpecialistId, createBranchId),
    [createBranchId, createSpecialistId, filterMeta.services],
  );

  // #225: duration from drag-interval (end − start), used as fallback when no service
  // is selected yet or the service has no configured duration.
  const dragDurationMinutes = useMemo(() => {
    if (!createInitialStart || !createInitialEnd) return null;
    const startMs = new Date(createInitialStart).getTime();
    const endMs = new Date(createInitialEnd).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
    return Math.round((endMs - startMs) / 60_000);
  }, [createInitialStart, createInitialEnd]);

  const createDurationMinutes = useMemo(() => {
    const serviceDuration = createServiceId
      ? (createServiceOptions.find((s) => s.id === createServiceId)?.durationMinutes ?? null)
      : null;
    // #225: drag duration takes priority over service default so the slot size chosen
    // by the doctor is honoured. Service duration is only the fallback when no drag
    // interval is available (e.g. panel opened via «+ Создать запись» button).
    return dragDurationMinutes ?? serviceDuration;
  }, [createServiceId, createServiceOptions, dragDurationMinutes]);

  const openCreateForm = () => {
    const nextSpecialistId = resolveCalendarCreateFieldValue(
      filterMeta.specialists,
      activeFilters.specialistId,
      createSpecialistId,
    );
    setCreateSpecialistId(nextSpecialistId ?? filterMeta.specialists[0]?.id ?? null);
    const nextBranchId = resolveCalendarCreateFieldValue(
      filterMeta.branches,
      activeFilters.branchId,
      createBranchId,
    );
    const nextServices = listCreateServicesForSelection(
      filterMeta.services,
      nextSpecialistId ?? filterMeta.specialists[0]?.id ?? null,
      nextBranchId,
    );
    const nextServiceId = resolveCalendarCreateFieldValue(
      nextServices,
      activeFilters.serviceId,
      createServiceId,
    );
    setCreateBranchId(nextBranchId);
    setCreateServiceId(
      nextServices.some((service) => service.id === nextServiceId) ? nextServiceId : null,
    );
    setMode('create');
  };

  if (!selected) {
    return (
      <div className={doctorClientOverviewPrimaryCardClass}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className={doctorClientSectionTitleClass}>Запись</h2>
          {mode === 'view' ? (
            <Button type="button" size="sm" variant="outline" onClick={openCreateForm}>
              Создать
            </Button>
          ) : (
            // §3.6: если открыто через startInCreate — × закрывает панель полностью;
            // если открыто через кнопку «Создать» внутри плейсхолдера — возврат к плейсхолдеру
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => (startInCreate ? onClose() : setMode('view'))}
            >
              ×
            </Button>
          )}
        </div>
        {mode === 'view' ? (
          <p className="text-sm text-muted-foreground">Выберите событие в календаре.</p>
        ) : (
          <CreateForm
            filterMeta={filterMeta}
            serviceOptions={createServiceOptions}
            activeFilters={activeFilters}
            createStart={createStart}
            createDurationMinutes={createDurationMinutes}
            createSpecialistId={createSpecialistId}
            createBranchId={createBranchId}
            createServiceId={createServiceId}
            createPatient={createPatient}
            createComment={createComment}
            pending={pending}
            message={message}
            onStartChange={(value) => {
              setCreateStart(value);
              markCreateDirty();
            }}
            onSpecialistChange={(value) => {
              setCreateSpecialistId(value);
              if (
                !listCreateServicesForSelection(filterMeta.services, value, createBranchId).some(
                  (service) => service.id === createServiceId,
                )
              ) {
                setCreateServiceId(null);
              }
              markCreateDirty();
            }}
            onBranchChange={(value) => {
              setCreateBranchId(value);
              if (
                !listCreateServicesForSelection(
                  filterMeta.services,
                  createSpecialistId,
                  value,
                ).some((service) => service.id === createServiceId)
              ) {
                setCreateServiceId(null);
              }
              markCreateDirty();
            }}
            onServiceChange={(value) => {
              setCreateServiceId(value);
              markCreateDirty();
            }}
            onPatientChange={(value) => {
              setCreatePatient(value);
              markCreateDirty();
            }}
            onCommentChange={(value) => {
              setCreateComment(value);
              markCreateDirty();
            }}
            // §3.6: если открыто через startInCreate — отмена закрывает панель
            onCancel={() => (startInCreate ? onClose() : setMode('view'))}
            onSubmit={() => {
              if (
                !createStart ||
                !createDurationMinutes ||
                !createBranchId ||
                !createServiceId ||
                !createSpecialistId ||
                !createServiceOptions.some((service) => service.id === createServiceId)
              ) {
                setMessage('Заполните филиал, услугу и специалиста.');
                return;
              }
              const startAt = new Date(createStart).toISOString();
              const endAt = new Date(
                new Date(createStart).getTime() + createDurationMinutes * 60_000,
              ).toISOString();
              if (
                createPatient?.isNew === true &&
                (!createPatient.lastName?.trim() || !createPatient.firstName?.trim())
              ) {
                setMessage('Укажите фамилию и имя пациента.');
                return;
              }
              startTransition(async () => {
                const isNewPatient = createPatient?.isNew === true;
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
                            lastName: createPatient.lastName,
                            firstName: createPatient.firstName,
                            patronymic: createPatient.patronymic ?? null,
                            phone: createPatient.phone,
                            email: createPatient.email ?? null,
                          }
                        : {
                            platformUserId: createPatient?.id ?? null,
                            phoneNormalized: createPatient?.phone?.trim() || null,
                          }),
                      startAt,
                      endAt,
                      durationMinutes: createDurationMinutes,
                      specialistId: createSpecialistId,
                      branchId: createBranchId,
                      serviceId: createServiceId,
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
                  // R16: после создания (есть id) добавляем staff-коммент отдельным запросом.
                  const newId = json.appointment?.id;
                  if (newId && createComment.trim()) {
                    await fetch(`${apiBase}/appointments/${encodeURIComponent(newId)}/comments`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ body: createComment.trim() }),
                    }).catch(() => undefined);
                  }
                  setCreateComment('');
                  setMode('view');
                  onChanged();
                } else if (json.error === 'external_slot_taken') {
                  onChanged();
                }
              });
            }}
          />
        )}
      </div>
    );
  }

  const statusLabel = appointmentStatusLabel(selected.status);
  const patientPhoneHref = phoneToTelHref(selected.patientPhone);
  const isSoloMode = filterMeta.specialists.length === 1;
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

  return (
    <div className={doctorClientOverviewPrimaryCardClass}>
      <div
        data-testid="appointment-detail-header"
        className={cn('flex items-start justify-between gap-3', !showCloseControl && 'pr-10')}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-36 flex-1 text-base font-semibold leading-snug text-foreground">
              {selected.platformUserId ? (
                <Link
                  href={patientCardHref(selected.platformUserId)}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {selected.patientName ?? 'Запись'}
                </Link>
              ) : (
                (selected.patientName ?? 'Запись')
              )}
            </h2>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {selected.platformUserId ? (
                <DoctorOpenChatButton
                  patientUserId={selected.platformUserId}
                  patientName={selected.patientName}
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full"
                  title="Чат"
                >
                  <MessageCircle aria-hidden />
                  <span className="sr-only">Чат</span>
                </DoctorOpenChatButton>
              ) : null}
              {selected.patientPhone && patientPhoneHref ? (
                <>
                  <a
                    href={patientPhoneHref}
                    className={buttonVariants({
                      variant: 'outline',
                      size: 'icon-sm',
                      className: 'rounded-full md:hidden',
                    })}
                    aria-label={`Позвонить: ${selected.patientPhone}`}
                    title="Телефон"
                  >
                    <Phone aria-hidden />
                  </a>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="hidden min-w-8 rounded-full px-2 md:inline-flex"
                    onClick={() => void copyPatientPhone(selected.patientPhone!)}
                    aria-label={`Показать и скопировать телефон: ${selected.patientPhone}`}
                    title="Телефон"
                  >
                    <Phone aria-hidden />
                    <span>{selected.patientPhone}</span>
                    {phoneCopied ? <span role="status">Скопировано</span> : null}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {showCloseControl ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0 rounded-full"
            onClick={onClose}
            aria-label="Закрыть карточку записи"
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-base font-semibold tabular-nums text-foreground">
          {formatEventAt(selected.startAt, timeZone)}
        </p>
        <Badge
          variant="outline"
          className={cn(
            'h-7 rounded-full px-3 text-sm font-medium',
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

      <div className="mt-4 space-y-3 text-sm">
        <dl className="space-y-2">
          <div>
            <dt className="text-xs text-muted-foreground">Филиал</dt>
            <dd>{selected.branchTitle ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Услуга</dt>
            <dd>{selected.serviceTitle ?? '—'}</dd>
          </div>
          {!isSoloMode ? (
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
        {selected.platformUserId ? (
          <div className="flex justify-center py-1">
            <Link
              href={patientCardHref(selected.platformUserId, {
                tab: 'karta',
                createVisitFrom: selected.id,
                visitDate: selected.startAt ? selected.startAt.slice(0, 10) : undefined,
              })}
              className={buttonVariants({
                size: 'sm',
                className: 'h-9 px-4 text-sm',
              })}
            >
              Создать визит из записи
            </Link>
          </div>
        ) : null}
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
      </div>

      <AppointmentStaffCommentsSection appointmentId={selected.id} onChanged={onChanged} />

      {mode === 'reschedule' ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Label>Начало</Label>
          <DoctorDateTimePicker value={newStartLocal} onChange={setNewStartLocal} />
          <Label>Окончание</Label>
          <DoctorDateTimePicker value={newEndLocal} onChange={setNewEndLocal} />
        </div>
      ) : null}

      {/* R21: форма отмены разворачивается ВНИЗУ карточки */}
      {mode === 'cancel' ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <Label>Причина отмены</Label>
          <Select value={cancelReason} onValueChange={(v) => setCancelReason(v ?? '')}>
            <SelectTrigger
              displayLabel={
                CANCEL_REASONS.find((r) => r.value === cancelReason)?.label ?? 'Выберите причину'
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANCEL_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value} label={r.label}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Комментарий</Label>
          <Textarea
            rows={2}
            value={cancelComment}
            onChange={(e) => setCancelComment(e.target.value)}
            placeholder="Комментарий для истории записи"
          />
          <Label>Начисление</Label>
          <Select value={cancelCharge} onValueChange={(v) => setCancelCharge(v ?? 'free')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANCEL_CHARGE.map((c) => (
                <SelectItem key={c.value} value={c.value} label={c.label}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center justify-between gap-2 pt-1">
            <span className="text-sm">Уведомлять пациента</span>
            <Switch checked={cancelNotify} onCheckedChange={setCancelNotify} />
          </label>
        </div>
      ) : null}

      {/* R20: один ряд кнопок, зависит от статуса записи */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isCancelledAppointmentStatus(selected.status) ? (
          <>
            <Select value={postCancelClass} onValueChange={(v) => setPostCancelClass(v ?? 'free')}>
              <SelectTrigger className="w-[8.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_CANCEL_CLASS.map((c) => (
                  <SelectItem key={c.value} value={c.value} label={c.label}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canUseOwnSpecialistAppointmentActions(ownSpecialistId, selected.specialistId) &&
            isStaffDeletableCancelledStatus(selected.status) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto text-destructive"
                disabled={pending}
                onClick={() => {
                  // R22: удаление уже отменённой записи — пациенту не уведомляем (purge без side-effects).
                  if (!window.confirm('Удалить запись из календаря и кабинета пациента?')) return;
                  startTransition(async () => {
                    const res = await fetch(
                      `${apiBase}/appointments/${encodeURIComponent(selected.id)}/delete`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                      },
                    );
                    const json = (await res.json()) as { ok?: boolean; error?: string };
                    setMessage(json.ok ? 'Удалено' : panelErrorLabel(json.error));
                    if (json.ok) onChanged();
                  });
                }}
              >
                Удалить
              </Button>
            ) : null}
          </>
        ) : mode === 'reschedule' ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={pending || !newStartLocal || !newEndLocal}
              onClick={() => {
                const newStartAt = new Date(newStartLocal).toISOString();
                const newEndAt = new Date(newEndLocal).toISOString();
                const durationMinutes = Math.max(
                  1,
                  Math.round(
                    (new Date(newEndAt).getTime() - new Date(newStartAt).getTime()) / 60_000,
                  ),
                );
                startTransition(async () => {
                  const res = await fetch(
                    `${apiBase}/appointments/${encodeURIComponent(selected.id)}/manual-reschedule`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ newStartAt, newEndAt, durationMinutes }),
                    },
                  );
                  const json = (await res.json()) as { ok?: boolean; error?: string };
                  setMessage(json.ok ? 'Перенесено' : panelErrorLabel(json.error));
                  if (json.ok) {
                    onChanged();
                  } else if (json.error === 'external_slot_taken') {
                    onChanged();
                  } else {
                    setMode('view');
                  }
                });
              }}
            >
              Сохранить
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setMode('view')}
            >
              Отмена
            </Button>
          </>
        ) : mode === 'cancel' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const res = await fetch(
                    `${apiBase}/appointments/${encodeURIComponent(selected.id)}/manual-cancel`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        decisionType: cancelCharge,
                        ...(cancelReason ? { reason: cancelReason } : {}),
                        ...(cancelComment.trim() ? { staffComment: cancelComment.trim() } : {}),
                        notifyPatient: cancelNotify,
                      }),
                    },
                  );
                  const json = (await res.json()) as { ok?: boolean; error?: string };
                  setMessage(json.ok ? 'Отменено' : panelErrorLabel(json.error));
                  if (json.ok) onChanged();
                });
              }}
            >
              Подтвердить отмену
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setMode('view')}
            >
              Отмена
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setMode('reschedule')}
            >
              Перенести
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setMode('cancel')}
            >
              Отменить
            </Button>
          </>
        )}
      </div>
      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

type CreateFormProps = {
  filterMeta: CalendarFilterMeta;
  serviceOptions: CalendarServiceFilterOption[];
  activeFilters: CalendarCreateActiveFilters;
  createStart: string;
  createDurationMinutes: number | null;
  createSpecialistId: string | null;
  createBranchId: string | null;
  createServiceId: string | null;
  createPatient: CalendarPatientOption | null;
  createComment: string;
  pending: boolean;
  message: string | null;
  onStartChange: (v: string) => void;
  onSpecialistChange: (v: string | null) => void;
  onBranchChange: (v: string | null) => void;
  onServiceChange: (v: string | null) => void;
  onPatientChange: (v: CalendarPatientOption | null) => void;
  onCommentChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

function CreateForm(props: CreateFormProps) {
  const durationLabel =
    props.createDurationMinutes != null ? `${props.createDurationMinutes} мин` : '—';

  const branchMode = resolveCalendarCreateFieldMode(
    props.filterMeta.branches,
    props.activeFilters.branchId,
  );
  const specialistMode = resolveCalendarCreateFieldMode(
    props.filterMeta.specialists,
    props.activeFilters.specialistId,
  );
  const serviceMode = resolveCalendarCreateFieldMode(
    props.serviceOptions,
    props.activeFilters.serviceId,
  );

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <DoctorCalendarPatientSearch
        value={props.createPatient}
        onChange={props.onPatientChange}
        disabled={props.pending}
        deferNewPatientCreation
      />
      <Label>Начало</Label>
      {/* R17: готовый react-day-picker вместо нативного datetime-local */}
      <DoctorDateTimePicker
        value={props.createStart}
        onChange={props.onStartChange}
        disabled={props.pending}
      />
      <DoctorCalendarCreateFormField
        fieldLabel="Специалист"
        mode={specialistMode}
        options={props.filterMeta.specialists}
        value={props.createSpecialistId}
        noneLabel="Специалист"
        emptyLabel="Нет доступных специалистов."
        onChange={props.onSpecialistChange}
      />
      <DoctorCalendarCreateFormField
        fieldLabel="Филиал"
        mode={branchMode}
        options={props.filterMeta.branches}
        value={props.createBranchId}
        noneLabel="Филиал"
        emptyLabel="Нет доступных филиалов."
        onChange={props.onBranchChange}
      />
      <DoctorCalendarCreateFormField
        fieldLabel="Услуга"
        mode={serviceMode}
        options={props.serviceOptions}
        value={props.createServiceId}
        noneLabel="Услуга"
        emptyLabel={
          props.createSpecialistId && props.createBranchId
            ? 'Нет доступных услуг для выбранных специалиста и филиала.'
            : 'Сначала выберите специалиста и филиал.'
        }
        onChange={props.onServiceChange}
      />
      <Label>Длительность</Label>
      <Input readOnly value={durationLabel} aria-label="Длительность" />
      {/* R16: комментарий добавится как staff-коммент сразу после создания */}
      <Label>Комментарий</Label>
      <Textarea
        rows={2}
        value={props.createComment}
        disabled={props.pending}
        placeholder="Заметка к записи (необязательно)"
        onChange={(e) => props.onCommentChange(e.target.value)}
      />
      <div className="flex gap-2 pt-2">
        <Button type="button" size="sm" disabled={props.pending} onClick={props.onSubmit}>
          Сохранить
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={props.onCancel}>
          Отмена
        </Button>
      </div>
      {props.message ? <p className="text-xs text-muted-foreground">{props.message}</p> : null}
    </div>
  );
}
