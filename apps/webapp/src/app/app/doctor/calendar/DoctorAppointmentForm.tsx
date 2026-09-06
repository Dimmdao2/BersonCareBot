'use client';

import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { DoctorDateTimePicker } from '@/shared/ui/doctor/DoctorDateTimePicker';
import type {
  CalendarFilterMeta,
  CalendarServiceFilterOption,
} from '@/modules/booking-calendar/types';
import type { PrepaymentMode } from '@/modules/payments/types';
import { minorToRublesInput } from '@/app/app/settings/bookingSoloAdminApi';
import type { CalendarCreateActiveFilters } from '@/modules/booking-calendar/calendarCreateFieldMode';
import { resolveCalendarCreateFieldMode } from '@/modules/booking-calendar/calendarCreateFieldMode';
import {
  DoctorCalendarPatientSearch,
  type CalendarPatientOption,
} from './DoctorCalendarPatientSearch';
import { DoctorCalendarCreateFormField } from './DoctorCalendarCreateFormField';

/**
 * PAY-APPT-03: условие оплаты ЭТОЙ записи. Режим — тот же общесистемный словарь, что и у политики
 * клиники; процент врач набирает по-человечески, в базисные пункты его переводит отправка.
 */
export type AppointmentPrepaymentDraft = {
  mode: PrepaymentMode;
  percent: string;
};

/** Черновик записи. Одна форма обслуживает и создание, и режим «Изменить». */
export type AppointmentFormDraft = {
  /** "yyyy-MM-dd'T'HH:mm" — дата и время начала. */
  start: string;
  durationMinutes: number | null;
  specialistId: string | null;
  branchId: string | null;
  serviceId: string | null;
  patient: CalendarPatientOption | null;
  comment: string;
  status: string | null;
  /** PAY-APPT-01: стоимость в рублях ровно как её набирает врач; в копейки переводит отправка. */
  priceRubles: string;
  /**
   * PAY-APPT-02: врач уже задал стоимость руками. Смена услуги подставляет цену новой услуги
   * только пока этого не произошло — сохранённый ручной снимок не перетирается сам.
   */
  priceOverridden: boolean;
  /** `null` — клиника предоплату не принимает, и условия оплаты в форме нет вовсе. */
  prepayment: AppointmentPrepaymentDraft | null;
  /** PAY-APPT-03: условие оплаты задано врачом; смена услуги его больше не переставляет. */
  prepaymentOverridden: boolean;
};

/** Переопределяемые врачом условия — ровно три, названные владельцем. */
const PREPAYMENT_MODE_LABELS: Record<PrepaymentMode, string> = {
  disabled: 'Без предоплаты',
  percent: 'Процент предоплаты',
  full_price: 'Полная предоплата',
  fixed_minor: 'Фиксированная сумма',
};
const OVERRIDABLE_PREPAYMENT_MODES: PrepaymentMode[] = ['disabled', 'percent', 'full_price'];

export function prepaymentPercentFromBps(percentBps: number | null): string {
  if (percentBps == null) return '';
  return String(percentBps / 100);
}

export function servicePriceRublesInput(priceMinor: number | null): string {
  return priceMinor == null ? '' : minorToRublesInput(priceMinor);
}

export type AppointmentStatusOption = { value: string; label: string };

type Props = {
  mode: 'create' | 'edit';
  draft: AppointmentFormDraft;
  onDraftChange: (patch: Partial<AppointmentFormDraft>) => void;
  filterMeta: CalendarFilterMeta;
  serviceOptions: CalendarServiceFilterOption[];
  activeFilters: CalendarCreateActiveFilters;
  /**
   * Серверные данные доказали, что специалист в клинике ровно один — выбирать нечего
   * (APPT-FORM-07). Во всех остальных случаях поле остаётся видимым.
   */
  hideSpecialist: boolean;
  /** Пациент уже закреплён за существующей записью и в этой форме не меняется. */
  hidePatient?: boolean;
  /** Достижимые статусы: только те, за которыми стоит существующий контракт. */
  statusOptions: AppointmentStatusOption[];
  pending: boolean;
  message: string | null;
};

export function DoctorAppointmentForm({
  mode,
  draft,
  onDraftChange,
  filterMeta,
  serviceOptions,
  activeFilters,
  hideSpecialist,
  hidePatient = false,
  statusOptions,
  pending,
  message,
}: Props) {
  const specialistMode = resolveCalendarCreateFieldMode(
    filterMeta.specialists,
    activeFilters.specialistId,
  );
  const branchMode = resolveCalendarCreateFieldMode(filterMeta.branches, activeFilters.branchId);
  const serviceMode = resolveCalendarCreateFieldMode(serviceOptions, activeFilters.serviceId);

  const setServiceId = (value: string | null) => {
    const service = value ? serviceOptions.find((option) => option.id === value) : undefined;
    const duration = service?.durationMinutes ?? null;
    // PAY-APPT-02: смена услуги подставляет цену и условие новой услуги, но ровно до тех пор,
    // пока врач не задал их сам. Уже сохранённое ручное значение не переписывается молча.
    const financialDefaults: Partial<AppointmentFormDraft> = {
      ...(draft.priceOverridden
        ? {}
        : { priceRubles: servicePriceRublesInput(service?.priceMinor ?? null) }),
      ...(draft.prepaymentOverridden
        ? {}
        : {
            prepayment: service?.prepaymentDefault
              ? {
                  mode: service.prepaymentDefault.mode,
                  percent: prepaymentPercentFromBps(service.prepaymentDefault.percentBps),
                }
              : null,
          }),
    };
    // APPT-FORM-09: длительность подставляется из услуги и остаётся редактируемой.
    onDraftChange({
      serviceId: value,
      ...(duration ? { durationMinutes: duration } : {}),
      ...financialDefaults,
    });
  };

  const prepayment = draft.prepayment;
  const prepaymentModeOptions = prepayment
    ? OVERRIDABLE_PREPAYMENT_MODES.includes(prepayment.mode)
      ? OVERRIDABLE_PREPAYMENT_MODES
      : // Политика услуги может стоять на режиме, которого нет в словаре записи. Врач обязан
        // ВИДЕТЬ действующее условие, поэтому оно остаётся в списке; выбрав другое, он его
        // переопределяет, а не «теряет».
        [...OVERRIDABLE_PREPAYMENT_MODES, prepayment.mode]
    : [];

  return (
    <div className="flex flex-col gap-3">
      {hidePatient ? null : (
        <DoctorCalendarPatientSearch
          value={draft.patient}
          onChange={(patient) => onDraftChange({ patient })}
          disabled={pending}
          deferNewPatientCreation={mode === 'create'}
        />
      )}

      <div className="flex flex-col gap-1">
        <Label>Начало</Label>
        <DoctorDateTimePicker
          value={draft.start}
          ariaLabel="Начало"
          onChange={(start) => onDraftChange({ start })}
          disabled={pending}
        />
      </div>

      {hideSpecialist ? null : (
        <DoctorCalendarCreateFormField
          fieldLabel="Специалист"
          mode={specialistMode}
          options={filterMeta.specialists}
          value={draft.specialistId}
          noneLabel="Специалист"
          emptyLabel="Нет доступных специалистов."
          disabled={pending}
          onChange={(specialistId) => onDraftChange({ specialistId })}
        />
      )}

      <DoctorCalendarCreateFormField
        fieldLabel="Филиал"
        mode={branchMode}
        options={filterMeta.branches}
        value={draft.branchId}
        noneLabel="Филиал"
        emptyLabel="Нет доступных филиалов."
        disabled={pending}
        onChange={(branchId) => onDraftChange({ branchId })}
      />

      <DoctorCalendarCreateFormField
        fieldLabel="Сеанс"
        mode={serviceMode}
        options={serviceOptions}
        value={draft.serviceId}
        noneLabel="Сеанс"
        emptyLabel={
          draft.specialistId && draft.branchId
            ? 'Нет доступных сеансов для выбранных специалиста и филиала.'
            : 'Сначала выберите специалиста и филиал.'
        }
        disabled={pending}
        onChange={setServiceId}
      />

      <div className="flex flex-col gap-1">
        <Label htmlFor="appointment-duration">Длительность, мин</Label>
        <Input
          id="appointment-duration"
          type="number"
          inputMode="numeric"
          min={5}
          step={5}
          className="w-full"
          aria-label="Длительность, мин"
          disabled={pending}
          value={draft.durationMinutes ?? ''}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            onDraftChange({ durationMinutes: Number.isFinite(next) ? next : null });
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="appointment-price">Стоимость, ₽</Label>
        <Input
          id="appointment-price"
          inputMode="decimal"
          className="w-full"
          aria-label="Стоимость, ₽"
          disabled={pending}
          value={draft.priceRubles}
          onChange={(event) =>
            onDraftChange({ priceRubles: event.target.value, priceOverridden: true })
          }
        />
      </div>

      {prepayment ? (
        <div className="flex flex-col gap-1">
          <Label>Условие оплаты</Label>
          <Select
            value={prepayment.mode}
            disabled={pending}
            onValueChange={(value) =>
              onDraftChange({
                prepayment: { ...prepayment, mode: (value as PrepaymentMode) ?? 'disabled' },
                prepaymentOverridden: true,
              })
            }
          >
            <SelectTrigger
              className="w-full"
              aria-label="Условие оплаты"
              displayLabel={PREPAYMENT_MODE_LABELS[prepayment.mode]}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {prepaymentModeOptions.map((option) => (
                <SelectItem key={option} value={option} label={PREPAYMENT_MODE_LABELS[option]}>
                  {PREPAYMENT_MODE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {prepayment?.mode === 'percent' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="appointment-prepayment-percent">Процент предоплаты, %</Label>
          <Input
            id="appointment-prepayment-percent"
            inputMode="decimal"
            className="w-full"
            aria-label="Процент предоплаты, %"
            disabled={pending}
            value={prepayment.percent}
            onChange={(event) =>
              onDraftChange({
                prepayment: { ...prepayment, percent: event.target.value },
                prepaymentOverridden: true,
              })
            }
          />
        </div>
      ) : null}

      {mode === 'edit' && statusOptions.length > 1 ? (
        <div className="flex flex-col gap-1">
          <Label>Статус</Label>
          <Select
            value={draft.status ?? statusOptions[0]!.value}
            disabled={pending}
            onValueChange={(value) => onDraftChange({ status: value ?? null })}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Статус"
              displayLabel={
                statusOptions.find((option) => option.value === draft.status)?.label ??
                statusOptions[0]!.label
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} label={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor="appointment-comment">Комментарий</Label>
        <Textarea
          id="appointment-comment"
          value={draft.comment}
          disabled={pending}
          aria-label="Комментарий"
          onChange={(event) => onDraftChange({ comment: event.target.value })}
        />
      </div>

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
