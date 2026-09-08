'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { Check } from 'lucide-react';
import type { PatientAppointmentItem, PatientCardHeader } from '@/modules/doctor-clients/ports';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { formatDoctorFioShort } from '@/shared/lib/fio';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import {
  DoctorModal,
  DoctorModalFooter,
  DoctorModalStackedTitle,
} from '@/shared/ui/doctor/DoctorModal';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorAppointmentCreatePanel } from '@/app/app/doctor/calendar/DoctorNewAppointmentModal';

type StartMode = 'select' | 'create' | 'without';

const MODE_OPTIONS: ReadonlyArray<{ value: StartMode; label: string }> = [
  { value: 'select', label: 'Выбрать запись на приём' },
  { value: 'create', label: 'Создать запись на приём' },
  { value: 'without', label: 'Без записи на приём' },
];

type UnlinkedApiResponse = { ok: boolean; appointments: PatientAppointmentItem[] };

function appointmentKey(appointment: PatientAppointmentItem): string {
  return appointment.internalId ?? appointment.id;
}

function appointmentDateTime(appointment: PatientAppointmentItem, timeZone: string): DateTime {
  return DateTime.fromISO(appointment.dateTime, { setZone: true }).setZone(timeZone);
}

function appointmentLabel(appointment: PatientAppointmentItem, timeZone: string): string {
  const dateTime = appointmentDateTime(appointment, timeZone);
  const at = dateTime.isValid
    ? dateTime.setLocale('ru').toFormat('d MMMM yyyy, HH:mm')
    : 'Дата не указана';
  return [at, appointment.locationShort ?? appointment.location, appointment.serviceName]
    .filter(Boolean)
    .join(' · ');
}

export function PatientEncounterStartModal({
  open,
  userId,
  header,
  displayIana,
  todayIso,
  initialAppointmentId,
  appointmentsManageOwn = true,
  videoMeetingsEnabled = false,
  onClose,
}: {
  open: boolean;
  userId: string;
  header: PatientCardHeader;
  displayIana: string;
  todayIso: string;
  initialAppointmentId: string | null;
  appointmentsManageOwn?: boolean;
  videoMeetingsEnabled?: boolean;
  onClose: () => void;
}) {
  const { patientGenitive } = useDoctorPatientTerms();
  const router = useRouter();
  const [mode, setMode] = useState<StartMode>('select');
  const [appointments, setAppointments] = useState<PatientAppointmentItem[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(
    initialAppointmentId,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void fetch(`/api/doctor/patients/${userId}/appointments/unlinked`, {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.json() as Promise<UnlinkedApiResponse>;
      })
      .then((payload) => {
        if (cancelled) return;
        const available = payload.ok ? payload.appointments : [];
        setAppointments(available);
        setSelectedAppointmentId((current) => {
          if (current && available.some((appointment) => appointmentKey(appointment) === current)) {
            return current;
          }
          const now = DateTime.now().setZone(displayIana);
          const nextToday = available
            .filter((appointment) => {
              const at = appointmentDateTime(appointment, displayIana);
              return at.isValid && at.toISODate() === todayIso && at >= now;
            })
            .sort(
              (left, right) =>
                appointmentDateTime(left, displayIana).toMillis() -
                appointmentDateTime(right, displayIana).toMillis(),
            )[0];
          return nextToday ? appointmentKey(nextToday) : null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAppointments([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [displayIana, open, todayIso, userId]);

  const featuredAppointment = useMemo(() => {
    const now = DateTime.now().setZone(displayIana);
    return appointments
      .filter((appointment) => {
        const at = appointmentDateTime(appointment, displayIana);
        return at.isValid && at.toISODate() === todayIso && at >= now;
      })
      .sort(
        (left, right) =>
          appointmentDateTime(left, displayIana).toMillis() -
          appointmentDateTime(right, displayIana).toMillis(),
      )[0];
  }, [appointments, displayIana, todayIso]);

  const otherAppointments = useMemo(() => {
    const featuredId = featuredAppointment ? appointmentKey(featuredAppointment) : null;
    return appointments.filter((appointment) => appointmentKey(appointment) !== featuredId);
  }, [appointments, featuredAppointment]);

  const patientName = formatDoctorFioShort(header.identity, header.identity.displayName);
  const patient = {
    id: userId,
    displayName: header.identity.displayName,
    firstName: header.identity.firstName,
    lastName: header.identity.lastName,
    patronymic: header.identity.patronymic,
    phone: header.identity.phone,
    email: header.identity.email,
  };
  const modeOptions = appointmentsManageOwn
    ? MODE_OPTIONS
    : MODE_OPTIONS.filter((option) => option.value !== 'create');
  const selectedModeLabel = modeOptions.find((option) => option.value === mode)?.label;

  const openEncounter = (appointmentId?: string) => {
    const params = new URLSearchParams();
    if (appointmentId) params.set('appointmentId', appointmentId);
    else params.set('withoutAppointment', '1');
    onClose();
    router.push(`/app/doctor/patients/${encodeURIComponent(userId)}/visits/new?${params}`);
  };
  const openOnline = (appointmentId?: string) => {
    const params = appointmentId ? `?${new URLSearchParams({ appointmentId })}` : '';
    onClose();
    router.push(`/app/doctor/patients/${encodeURIComponent(userId)}/live${params}`);
  };

  const footer =
    mode === 'create' ? undefined : (
      <DoctorModalFooter>
        {videoMeetingsEnabled ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={mode === 'select' && !selectedAppointmentId}
              onClick={() =>
                openEncounter(mode === 'select' ? (selectedAppointmentId ?? undefined) : undefined)
              }
            >
              Очный приём
            </Button>
            <Button
              type="button"
              disabled={mode === 'select' && !selectedAppointmentId}
              onClick={() =>
                openOnline(mode === 'select' ? (selectedAppointmentId ?? undefined) : undefined)
              }
            >
              Онлайн-приём
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="button"
              disabled={mode === 'select' && !selectedAppointmentId}
              onClick={() =>
                openEncounter(mode === 'select' ? (selectedAppointmentId ?? undefined) : undefined)
              }
            >
              Начать приём
            </Button>
          </>
        )}
      </DoctorModalFooter>
    );

  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      title={
        <DoctorModalStackedTitle
          label="Начать приём"
          patientName={patientName}
          patientOnSupport={header.support.isOnSupport}
          patientVariant="context"
        />
      }
      size="lg"
      desktopPresentation="right-sheet"
      bodyVariant={mode === 'select' ? 'list' : 'default'}
      bodyHeader={
        <div className="px-4 py-3">
          <Select value={mode} onValueChange={(value) => setMode((value as StartMode) ?? 'select')}>
            <SelectTrigger className="w-full" displayLabel={selectedModeLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {mode === 'select' ? (
        loading ? (
          <DoctorPanelLoading className="min-h-32" />
        ) : loadError ? (
          <p role="alert" className="px-4 py-4 text-sm text-destructive">
            Не удалось загрузить записи {patientGenitive}.
          </p>
        ) : appointments.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Доступных записей нет.</p>
        ) : (
          <div className="flex min-h-0 flex-col">
            {featuredAppointment ? (
              <div className="border-b border-border/60 px-4 py-3">
                <p className="mb-2 text-sm font-medium text-foreground">Ближайшая запись сегодня</p>
                <AppointmentChoice
                  appointment={featuredAppointment}
                  timeZone={displayIana}
                  selected={selectedAppointmentId === appointmentKey(featuredAppointment)}
                  featured
                  onSelect={setSelectedAppointmentId}
                />
              </div>
            ) : null}
            {otherAppointments.length > 0 ? (
              <DoctorDnaFlatList>
                {otherAppointments.map((appointment) => (
                  <li key={appointmentKey(appointment)}>
                    <AppointmentChoice
                      appointment={appointment}
                      timeZone={displayIana}
                      selected={selectedAppointmentId === appointmentKey(appointment)}
                      onSelect={setSelectedAppointmentId}
                    />
                  </li>
                ))}
              </DoctorDnaFlatList>
            ) : null}
          </div>
        )
      ) : mode === 'create' && appointmentsManageOwn ? (
        <DoctorAppointmentCreatePanel
          active={open}
          patient={patient}
          fallbackTimeZone={displayIana}
          appointmentsManageOwn={appointmentsManageOwn}
          onClose={onClose}
          onCreated={openEncounter}
          createContinuation={videoMeetingsEnabled ? { onOffline: openEncounter, onOnline: openOnline } : undefined}
        />
      ) : (
        <p className="py-4 text-sm text-foreground">Будет создан новый приём без записи.</p>
      )}
      {footer}
    </DoctorModal>
  );
}

function AppointmentChoice({
  appointment,
  timeZone,
  selected,
  featured = false,
  onSelect,
}: {
  appointment: PatientAppointmentItem;
  timeZone: string;
  selected: boolean;
  featured?: boolean;
  onSelect: (appointmentId: string) => void;
}) {
  const id = appointmentKey(appointment);
  return (
    <button
      type="button"
      className={cn(
        doctorDnaFlatListRowClass,
        'w-full justify-between text-left hover:bg-muted/60',
        featured && 'rounded-lg border border-border bg-card',
        selected && 'bg-primary/10',
      )}
      onClick={() => onSelect(id)}
    >
      <span className="min-w-0">
        <span className="block text-base text-foreground">
          {appointmentLabel(appointment, timeZone)}
        </span>
        {appointment.specialistName ? (
          <span className={cn('block', doctorDnaFlatListMetaClass)}>
            {appointment.specialistName}
          </span>
        ) : null}
      </span>
      {selected ? <Check className="size-5 shrink-0 text-primary" aria-label="Выбрано" /> : null}
    </button>
  );
}
