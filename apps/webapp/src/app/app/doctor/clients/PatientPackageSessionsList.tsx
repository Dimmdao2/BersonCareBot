"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PatientPackageSessionRow } from "@/modules/memberships/types";

const LINKAGE_LABELS: Record<string, string> = {
  reserved: "Резерв",
  consumed: "Списано",
  penalty: "Штраф",
  released: "Отвязано",
  refunded: "Возврат",
  none: "—",
};

type DetachOutcome = "release_reserve" | "charge_as_delivered" | "refund_consumed";

const FIRST_CONFIRM_TEXT: Record<DetachOutcome, string> = {
  release_reserve: "Точно отвязать эту запись и вернуть занятие в абонемент?",
  refund_consumed: "Вернуть списанный сеанс в абонемент?",
  charge_as_delivered: "Списать этот сеанс как оказанный?",
};

type Props = {
  packageId: string;
  apiBase: string;
  onError?: (code: string) => void;
  onChanged?: () => void;
};

export function PatientPackageSessionsList({ packageId, apiBase, onError, onChanged }: Props) {
  const [includePast, setIncludePast] = useState(false);
  const [sessions, setSessions] = useState<PatientPackageSessionRow[]>([]);
  const [pending, startTransition] = useTransition();
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [pendingDetach, setPendingDetach] = useState<{
    appointmentId: string;
    outcome: DetachOutcome;
    isPast: boolean;
  } | null>(null);
  const [lateChoice, setLateChoice] = useState<{
    appointmentId: string;
    isPast: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `${apiBase}/${packageId}/sessions?includePast=${includePast ? "true" : "false"}`,
    );
    const json = (await res.json()) as {
      ok?: boolean;
      sessions?: PatientPackageSessionRow[];
      error?: string;
    };
    if (!json.ok) {
      onError?.(json.error ?? "load_failed");
      return;
    }
    setSessions(json.sessions ?? []);
  }, [apiBase, includePast, onError, packageId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  function runDetach(
    appointmentId: string,
    outcome: DetachOutcome,
    opts?: { confirmPastTwice?: boolean; isPast?: boolean },
  ) {
    startTransition(async () => {
      const res = await fetch(
        `/api/doctor/booking-engine/appointments/${appointmentId}/package/detach`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome, confirmPastTwice: opts?.confirmPastTwice }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        if (json.error === "late_detach_choice_required") {
          const row = sessions.find((s) => s.appointmentId === appointmentId);
          setLateChoice({
            appointmentId,
            isPast: opts?.isPast ?? row?.isPast ?? false,
          });
          setPendingDetach(null);
          setConfirmStep(0);
          return;
        }
        onError?.(json.error ?? "detach_failed");
        return;
      }
      setConfirmStep(0);
      setPendingDetach(null);
      setLateChoice(null);
      void load();
      onChanged?.();
    });
  }

  function beginDetach(appointmentId: string, outcome: DetachOutcome, isPast: boolean) {
    setPendingDetach({ appointmentId, outcome, isPast });
    setConfirmStep(1);
  }

  function beginManualConsume(appointmentId: string, isPast: boolean) {
    beginDetach(appointmentId, "charge_as_delivered", isPast);
  }

  function afterFirstConfirm() {
    if (!pendingDetach) return;
    const detach = pendingDetach;
    if (detach.isPast) {
      setConfirmStep(2);
      return;
    }
    setPendingDetach(null);
    setConfirmStep(0);
    runDetach(detach.appointmentId, detach.outcome, { isPast: detach.isPast });
  }

  function afterSecondConfirm() {
    if (!pendingDetach) return;
    const detach = pendingDetach;
    runDetach(detach.appointmentId, detach.outcome, {
      confirmPastTwice: true,
      isPast: detach.isPast,
    });
  }

  function formatWhen(iso: string) {
    try {
      return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <input
          id={`past-${packageId}`}
          type="checkbox"
          className="size-4 rounded border"
          checked={includePast}
          onChange={(e) => setIncludePast(e.target.checked)}
        />
        <Label htmlFor={`past-${packageId}`} className="text-xs font-normal">
          Показать прошедшие
        </Label>
      </div>
      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-xs">Нет записей по абонементу.</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {sessions.map((s) => (
            <li key={s.appointmentId} className="rounded-lg border border-border/60 px-2 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{formatWhen(s.startsAt)}</span>
                <span className="text-muted-foreground">{s.serviceTitle}</span>
                {s.branchTitle ? (
                  <span className="text-muted-foreground text-xs">{s.branchTitle}</span>
                ) : null}
                <Badge variant="secondary" className="text-xs">
                  {LINKAGE_LABELS[s.linkage] ?? s.linkage}
                </Badge>
                {s.mappingStatus === "mapping_missing" ? (
                  <Badge variant="destructive" className="text-xs">
                    нет связи услуги
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.actions.canUnlinkReserve ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => beginDetach(s.appointmentId, "release_reserve", s.isPast)}
                  >
                    Отвязать
                  </Button>
                ) : null}
                {s.actions.canRefundConsumed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => beginDetach(s.appointmentId, "refund_consumed", s.isPast)}
                  >
                    Вернуть сеанс
                  </Button>
                ) : null}
                {s.actions.canManualConsume ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => beginManualConsume(s.appointmentId, s.isPast)}
                  >
                    Списать как оказанную
                  </Button>
                ) : null}
                {s.actions.canOpenInCalendar ? (
                  <Link
                    href={`/app/doctor/calendar?appointmentId=${encodeURIComponent(s.appointmentId)}`}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
                  >
                    Календарь
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={confirmStep === 1} onOpenChange={(o) => !o && setConfirmStep(0)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подтверждение</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {pendingDetach
              ? FIRST_CONFIRM_TEXT[pendingDetach.outcome]
              : "Подтвердите действие."}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmStep(0)}>
              Отмена
            </Button>
            <Button type="button" onClick={afterFirstConfirm}>
              Продолжить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmStep === 2} onOpenChange={(o) => !o && setConfirmStep(0)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Прошедшая запись</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Сеанс уже прошел. Проверьте, что выбрана правильная запись.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmStep(0)}>
              Отмена
            </Button>
            <Button type="button" onClick={afterSecondConfirm}>
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lateChoice !== null} onOpenChange={(o) => !o && setLateChoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Поздняя отвязка</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Выберите исход для записи вне бесплатного окна отмены.</p>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            <Button
              type="button"
              onClick={() => {
                if (!lateChoice) return;
                const { appointmentId, isPast } = lateChoice;
                setLateChoice(null);
                beginDetach(appointmentId, "release_reserve", isPast);
              }}
            >
              Вернуть резерв в абонемент
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!lateChoice) return;
                const { appointmentId, isPast } = lateChoice;
                setLateChoice(null);
                beginDetach(appointmentId, "charge_as_delivered", isPast);
              }}
            >
              Списать как оказанную
            </Button>
            <Button type="button" variant="outline" onClick={() => setLateChoice(null)}>
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
