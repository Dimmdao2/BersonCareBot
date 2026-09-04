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
import type { CalendarCreateActiveFilters } from '@/modules/booking-calendar/calendarCreateFieldMode';
import { resolveCalendarCreateFieldMode } from '@/modules/booking-calendar/calendarCreateFieldMode';
import {
  DoctorCalendarPatientSearch,
  type CalendarPatientOption,
} from './DoctorCalendarPatientSearch';
import { DoctorCalendarCreateFormField } from './DoctorCalendarCreateFormField';

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
};

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
  /** У переноса записи на другого пациента нет серверного контракта — поле только читается. */
  patientLocked: boolean;
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
  patientLocked,
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
    const duration = value
      ? (serviceOptions.find((service) => service.id === value)?.durationMinutes ?? null)
      : null;
    // APPT-FORM-09: длительность подставляется из услуги и остаётся редактируемой.
    onDraftChange({ serviceId: value, ...(duration ? { durationMinutes: duration } : {}) });
  };

  return (
    <div className="flex flex-col gap-3">
      {patientLocked ? (
        <div className="flex flex-col gap-1">
          <Label>Пациент</Label>
          <Input
            readOnly
            aria-label="Пациент"
            className="w-full"
            value={draft.patient?.displayName ?? '—'}
          />
        </div>
      ) : (
        <DoctorCalendarPatientSearch
          value={draft.patient}
          onChange={(patient) => onDraftChange({ patient })}
          disabled={pending}
          deferNewPatientCreation
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
        fieldLabel="Услуга"
        mode={serviceMode}
        options={serviceOptions}
        value={draft.serviceId}
        noneLabel="Услуга"
        emptyLabel={
          draft.specialistId && draft.branchId
            ? 'Нет доступных услуг для выбранных специалиста и филиала.'
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
