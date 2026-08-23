'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { TodayNextAppointmentItem } from './loadDoctorTodayDashboard';
import { patientCardHref } from './patients/patientCardHref';
import {
  APPOINTMENT_CANCEL_CHARGE_OPTIONS,
  APPOINTMENT_CANCEL_REASONS,
} from './calendar/appointmentCancellationOptions';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
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

type Props = {
  appointment: TodayNextAppointmentItem | null;
};

export function DoctorTodayNextAppointment({ appointment }: Props) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelComment, setCancelComment] = useState('');
  const [cancelCharge, setCancelCharge] = useState('free');
  const [cancelNotify, setCancelNotify] = useState(true);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const patientHref = appointment?.clientUserId ? patientCardHref(appointment.clientUserId) : null;
  const createVisitHref = appointment?.clientUserId
    ? patientCardHref(appointment.clientUserId, {
        tab: 'karta',
        createVisitFrom: appointment.id,
        visitDate: appointment.visitDate,
      })
    : null;

  function cancelAppointment() {
    if (!appointment) return;
    setCancelError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/doctor/booking-engine/appointments/${encodeURIComponent(appointment.id)}/manual-cancel`,
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
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          setCancelError('Не удалось отменить запись');
          return;
        }
        setCancelOpen(false);
        router.refresh();
      } catch {
        setCancelError('Не удалось отменить запись');
      }
    });
  }

  return (
    <DoctorSection id="doctor-today-next-appointment">
      <DoctorSectionHeader>
        <DoctorSectionTitle>
          {appointment?.isCurrent
            ? 'Сейчас на приеме'
            : `Следующий прием: ${appointment?.relativeLabel || 'нет записей'}`}
        </DoctorSectionTitle>
      </DoctorSectionHeader>

      {appointment ? (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid min-w-0 gap-2 text-sm">
            <p className="text-base font-medium tabular-nums">{appointment.dateTimeLabel}</p>
            <dl className="grid min-w-0 gap-1.5">
              <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                <dt className="text-muted-foreground">Клиент</dt>
                <dd className="min-w-0 truncate">{appointment.clientLabel}</dd>
              </div>
              <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                <dt className="text-muted-foreground">Комментарий</dt>
                <dd className="min-w-0 whitespace-pre-wrap">{appointment.comment ?? '—'}</dd>
              </div>
              <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
                <dt className="text-muted-foreground">Перенос</dt>
                <dd>{appointment.wasRescheduled ? 'Да' : 'Нет'}</dd>
              </div>
            </dl>
          </div>

          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.75fr)] items-center gap-1.5">
            {patientHref ? (
              <Link
                className={buttonVariants({
                  size: 'sm',
                  className: 'min-w-0 px-1 text-xs sm:px-3 sm:text-sm',
                })}
                href={patientHref}
              >
                Открыть карточку
              </Link>
            ) : (
              <Button size="sm" className="min-w-0 px-1 text-xs sm:px-3 sm:text-sm" disabled>
                Открыть карточку
              </Button>
            )}
            {createVisitHref ? (
              <Link
                className={buttonVariants({
                  variant: 'outline',
                  size: 'sm',
                  className: 'min-w-0 px-1 text-xs sm:px-3 sm:text-sm',
                })}
                href={createVisitHref}
              >
                Создать визит
              </Link>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="min-w-0 px-1 text-xs sm:px-3 sm:text-sm"
                disabled
              >
                Создать визит
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-w-0 px-1 text-xs text-destructive sm:px-3 sm:text-sm"
              onClick={() => setCancelOpen(true)}
            >
              Отменить
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отменить запись</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Причина отмены</Label>
              <Select value={cancelReason} onValueChange={(value) => setCancelReason(value ?? '')}>
                <SelectTrigger
                  displayLabel={
                    APPOINTMENT_CANCEL_REASONS.find((item) => item.value === cancelReason)?.label ??
                    'Выберите причину'
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_CANCEL_REASONS.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Комментарий</Label>
              <Textarea
                rows={2}
                value={cancelComment}
                onChange={(event) => setCancelComment(event.target.value)}
                placeholder="Комментарий для истории записи"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Начисление</Label>
              <Select
                value={cancelCharge}
                onValueChange={(value) => setCancelCharge(value ?? 'free')}
              >
                <SelectTrigger
                  displayLabel={
                    APPOINTMENT_CANCEL_CHARGE_OPTIONS.find((item) => item.value === cancelCharge)
                      ?.label
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPOINTMENT_CANCEL_CHARGE_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-2">
              <span className="text-sm">Уведомлять пациента</span>
              <Switch checked={cancelNotify} onCheckedChange={setCancelNotify} />
            </label>
            {cancelError ? <p className="text-xs text-destructive">{cancelError}</p> : null}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isPending} />}>
              Назад
            </DialogClose>
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={isPending}
              onClick={cancelAppointment}
            >
              Подтвердить отмену
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DoctorSection>
  );
}
