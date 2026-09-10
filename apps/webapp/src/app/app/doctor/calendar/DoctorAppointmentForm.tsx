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
import type { AppointmentDeliveryFormat } from '@/modules/booking-engine/types';
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
  amountRubles: string;
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
  deliveryFormat: AppointmentDeliveryFormat;
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

const PREPAYMENT_MODE_LABELS: Record<PrepaymentMode, string> = {
  disabled: 'Без предоплаты',
  percent: 'Процент предоплаты',
  full_price: 'Полная предоплата',
  fixed_minor: 'Фиксированная сумма',
};
const OVERRIDABLE_PREPAYMENT_MODES: PrepaymentMode[] = [
  'disabled',
  'fixed_minor',
  'percent',
  'full_price',
];
const DELIVERY_FORMAT_LABELS: Record<AppointmentDeliveryFormat, string> = {
  in_person: 'Очный приём',
  online: 'Онлайн-приём',
};

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
  const selectedBranchIsOnline =
    filterMeta.branches.find((branch) => branch.id === draft.branchId)?.isOnline === true;
  const onlineBranchIds = new Set(
    filterMeta.branches.filter((branch) => branch.isOnline === true).map((branch) => branch.id),
  );

  const serviceSupportsOnline = (serviceId: string | null) => {
    if (!serviceId || !draft.specialistId) return false;
    return (
      filterMeta.services
        .find((service) => service.id === serviceId)
        ?.availability.some(
          (availability) =>
            availability.specialistId === draft.specialistId &&
            onlineBranchIds.has(availability.branchId),
        ) === true
    );
  };

  const serviceDraftPatch = (value: string | null): Partial<AppointmentFormDraft> => {
    const service = value ? serviceOptions.find((option) => option.id === value) : undefined;
    const supportsOnline = serviceSupportsOnline(value);
    return {
      serviceId: value,
      durationMinutes: service?.durationMinutes ?? null,
      deliveryFormat:
        selectedBranchIsOnline || (draft.deliveryFormat === 'online' && supportsOnline)
          ? 'online'
          : 'in_person',
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
                  amountRubles: servicePriceRublesInput(service.prepaymentDefault.amountMinor ?? null),
                }
              : null,
          }),
    };
  };

  const setServiceId = (value: string | null) => {
    // PAY-APPT-02: смена услуги подставляет цену и условие новой услуги, но ровно до тех пор,
    // пока врач не задал их сам. Уже сохранённое ручное значение не переписывается молча.
    onDraftChange(serviceDraftPatch(value));
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
        noneLabel="Выберите филиал"
        emptyLabel="Нет доступных филиалов."
        disabled={pending}
        onChange={(branchId) => {
          const nextServices = branchId
            ? filterMeta.services.filter((service) =>
                service.availability.some(
                  (availability) =>
                    availability.specialistId === draft.specialistId &&
                    availability.branchId === branchId,
                ),
              )
            : [];
          const nextServiceId = nextServices.some((service) => service.id === draft.serviceId)
            ? draft.serviceId
            : nextServices.length === 1
              ? nextServices[0]!.id
              : null;
          const nextService = nextServices.find((service) => service.id === nextServiceId);
          const nextBranchIsOnline =
            filterMeta.branches.find((branch) => branch.id === branchId)?.isOnline === true;
          onDraftChange({
            branchId,
            serviceId: nextServiceId,
            durationMinutes: nextService?.durationMinutes ?? null,
            deliveryFormat: nextBranchIsOnline ? 'online' : 'in_person',
            ...(draft.priceOverridden
              ? {}
              : { priceRubles: servicePriceRublesInput(nextService?.priceMinor ?? null) }),
            ...(draft.prepaymentOverridden
              ? {}
              : {
                  prepayment: nextService?.prepaymentDefault
                    ? {
                        mode: nextService.prepaymentDefault.mode,
                        percent: prepaymentPercentFromBps(
                          nextService.prepaymentDefault.percentBps,
                        ),
                        amountRubles: servicePriceRublesInput(
                          nextService.prepaymentDefault.amountMinor ?? null,
                        ),
                      }
                    : null,
                }),
          });
        }}
      />

      <DoctorCalendarCreateFormField
        fieldLabel="Услуга"
        mode={serviceMode}
        options={serviceOptions}
        value={draft.serviceId}
        noneLabel="Выберите услугу"
        emptyLabel={
          draft.specialistId && draft.branchId
            ? 'Нет доступных услуг для выбранных специалиста и филиала.'
            : 'Сначала выберите специалиста и филиал.'
        }
        disabled={pending}
        onChange={setServiceId}
      />

      <div className="flex flex-col gap-1">
        <Label>Формат</Label>
        {selectedBranchIsOnline || !serviceSupportsOnline(draft.serviceId) ? (
          <Input
            readOnly
            value={DELIVERY_FORMAT_LABELS[selectedBranchIsOnline ? 'online' : 'in_person']}
            aria-label="Формат"
          />
        ) : (
          <Select
            value={draft.deliveryFormat}
            disabled={pending}
            onValueChange={(value) =>
              onDraftChange({ deliveryFormat: value as AppointmentDeliveryFormat })
            }
          >
            <SelectTrigger
              aria-label="Формат"
              displayLabel={DELIVERY_FORMAT_LABELS[draft.deliveryFormat]}
            />
            <SelectContent>
              <SelectItem value="in_person">Очный приём</SelectItem>
              <SelectItem value="online">Онлайн-приём</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label>Начало</Label>
        <DoctorDateTimePicker
          value={draft.start}
          ariaLabel="Начало"
          onChange={(start) => onDraftChange({ start })}
          disabled={pending}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="appointment-duration">Длительность, мин</Label>
          <Input
            id="appointment-duration"
            type="number"
            inputMode="numeric"
            min={5}
            step={5}
            aria-label="Длительность, мин"
            disabled={pending}
            value={draft.durationMinutes ?? ''}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              onDraftChange({ durationMinutes: Number.isFinite(next) ? next : null });
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="appointment-price">Стоимость, ₽</Label>
          <Input
            id="appointment-price"
            inputMode="decimal"
            aria-label="Стоимость, ₽"
            disabled={pending}
            value={draft.priceRubles}
            onChange={(event) =>
              onDraftChange({ priceRubles: event.target.value, priceOverridden: true })
            }
          />
        </div>
      </div>

      {prepayment ? (
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <Label>Условия предоплаты</Label>
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
                aria-label="Условия предоплаты"
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
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="appointment-prepayment-value">
              {prepayment.mode === 'percent'
                ? '%'
                : prepayment.mode === 'fixed_minor'
                  ? 'руб.'
                  : 'Значение'}
            </Label>
            <Input
              id="appointment-prepayment-value"
              inputMode="decimal"
              aria-label={prepayment.mode === 'percent' ? 'Процент' : 'Сумма предоплаты, руб.'}
              disabled={pending || !['percent', 'fixed_minor'].includes(prepayment.mode)}
              value={
                prepayment.mode === 'percent'
                  ? prepayment.percent
                  : prepayment.mode === 'fixed_minor'
                    ? prepayment.amountRubles
                    : ''
              }
              onChange={(event) =>
                onDraftChange({
                  prepayment:
                    prepayment.mode === 'percent'
                      ? { ...prepayment, percent: event.target.value }
                      : { ...prepayment, amountRubles: event.target.value },
                  prepaymentOverridden: true,
                })
              }
            />
          </div>
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
