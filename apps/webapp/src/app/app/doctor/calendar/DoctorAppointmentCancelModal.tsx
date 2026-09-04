'use client';

import { Button } from '@/shared/ui/doctor/primitives/button';
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
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import {
  APPOINTMENT_CANCEL_CHARGE_OPTIONS,
  APPOINTMENT_CANCEL_REASONS,
} from './appointmentCancellationOptions';

export type AppointmentCancelDraft = {
  reason: string;
  comment: string;
  charge: string;
  notify: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Контекст отменяемой записи: дата/время и пациент (CANCEL-03). */
  whenLabel: string;
  patientLabel: string;
  draft: AppointmentCancelDraft;
  onDraftChange: (patch: Partial<AppointmentCancelDraft>) => void;
  pending: boolean;
  onConfirm: () => void;
};

/**
 * Отмена записи — обычный второй слой общего модального стека: без своего затемнения
 * поверх уже открытой карточки и без половинчатой modal-вариации (CANCEL-01, CANCEL-02).
 */
export function DoctorAppointmentCancelModal({
  open,
  onClose,
  whenLabel,
  patientLabel,
  draft,
  onDraftChange,
  pending,
  onConfirm,
}: Props) {
  return (
    <DoctorModal
      open={open}
      onClose={onClose}
      nested
      title="Отмена записи"
      size="sm"
      footer={
        <>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            Подтвердить отмену
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium tabular-nums text-foreground">{whenLabel}</p>
          <p className="text-sm text-muted-foreground">{patientLabel}</p>
        </div>

        <div className="flex flex-col gap-1">
          <Label>Причина отмены</Label>
          <Select
            value={draft.reason}
            disabled={pending}
            onValueChange={(value) => onDraftChange({ reason: value ?? '' })}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Причина отмены"
              displayLabel={
                APPOINTMENT_CANCEL_REASONS.find((option) => option.value === draft.reason)?.label ??
                'Выберите причину'
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPOINTMENT_CANCEL_REASONS.map((option) => (
                <SelectItem key={option.value} value={option.value} label={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="appointment-cancel-comment">Комментарий к отмене</Label>
          <Textarea
            id="appointment-cancel-comment"
            value={draft.comment}
            disabled={pending}
            aria-label="Комментарий к отмене"
            onChange={(event) => onDraftChange({ comment: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label>Начисление</Label>
          <Select
            value={draft.charge}
            disabled={pending}
            onValueChange={(value) => onDraftChange({ charge: value ?? 'free' })}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Начисление"
              displayLabel={
                APPOINTMENT_CANCEL_CHARGE_OPTIONS.find((option) => option.value === draft.charge)
                  ?.label ?? 'Бесплатная'
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPOINTMENT_CANCEL_CHARGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} label={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center justify-between gap-2">
          <span className="text-sm">Уведомлять пациента</span>
          <Switch
            checked={draft.notify}
            disabled={pending}
            onCheckedChange={(notify) => onDraftChange({ notify })}
          />
        </label>
      </div>
    </DoctorModal>
  );
}
