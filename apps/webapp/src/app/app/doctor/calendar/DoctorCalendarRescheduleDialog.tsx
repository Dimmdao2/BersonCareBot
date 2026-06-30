"use client";

import { DateTime } from "luxon";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { Textarea } from "@/shared/ui/doctor/primitives/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/doctor/primitives/dialog";

/**
 * R34: подтверждение переноса/ресайза ПЕРЕД применением.
 * Перетаскивание/растягивание записи в календаре открывает этот диалог
 * («Было … → Стало …» + комментарий). Отмена → info.revert() (вызывает родитель);
 * подтверждение → reschedule-API со staffComment. Ошибка показывается здесь,
 * молчаливого отката нет.
 */
export type PendingReschedule = {
  patientName: string | null;
  oldStartAt: string;
  oldEndAt: string;
  newStartAt: string;
  newEndAt: string;
};

type Props = {
  pending: PendingReschedule | null;
  timeZone: string;
  comment: string;
  busy: boolean;
  error: string | null;
  onCommentChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

function parseFlexible(iso: string): DateTime {
  let dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromSQL(iso, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromJSDate(new Date(iso));
  return dt;
}

function describe(startIso: string, endIso: string, timeZone: string): string {
  const start = parseFlexible(startIso).setZone(timeZone);
  const end = parseFlexible(endIso).setZone(timeZone);
  if (!start.isValid) return "—";
  const durMin = end.isValid ? Math.max(1, Math.round(end.diff(start, "minutes").minutes)) : null;
  const base = start.toFormat("dd.MM.yyyy HH:mm");
  return durMin != null ? `${base} · ${durMin} мин` : base;
}

export function DoctorCalendarRescheduleDialog({
  pending,
  timeZone,
  comment,
  busy,
  error,
  onCommentChange,
  onConfirm,
  onCancel,
}: Props) {
  const open = pending !== null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Закрытие диалога любым способом (Esc/клик вне/крестик) = отмена с откатом.
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Изменить запись{pending?.patientName ? ` · ${pending.patientName}` : ""}?</DialogTitle>
          <DialogDescription>Подтвердите новое время приёма.</DialogDescription>
        </DialogHeader>
        {pending ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Было</p>
              <p className="font-medium">{describe(pending.oldStartAt, pending.oldEndAt, timeZone)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Стало</p>
              <p className="font-medium text-primary">
                {describe(pending.newStartAt, pending.newEndAt, timeZone)}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="reschedule-comment">Комментарий (необязательно)</Label>
              <Textarea
                id="reschedule-comment"
                rows={2}
                value={comment}
                disabled={busy}
                placeholder="Причина переноса для истории записи"
                onChange={(e) => onCommentChange(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            Отмена
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? "Сохранение…" : "Подтвердить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
