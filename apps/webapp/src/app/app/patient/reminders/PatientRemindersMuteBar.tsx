"use client";

import { useTransition } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  patientMutedTextClass,
  PatientShimmerLine,
  patientSurfaceWarningClass,
} from "@/shared/ui/patientVisual";

function tomorrowMorningIso(hour = 8): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function PatientRemindersMuteBar({
  muteUntilLabel,
}: {
  /** Отформатированная подпись конца паузы или null */
  muteUntilLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  const callMute = (body: Record<string, unknown>) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/patient/reminders/mute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { ok?: boolean };
        if (!res.ok || !data.ok) {
          toast.error("Не удалось изменить паузу уведомлений.");
          return;
        }
        toast.success("Готово.");
        refresh();
      } catch {
        toast.error("Сеть недоступна.");
      }
    });
  };

  const muted = Boolean(muteUntilLabel?.trim());

  return (
    <div className="mb-4 space-y-3" aria-busy={pending}>
      {muted ? (
        <div
          className={cn(
            patientSurfaceWarningClass,
            "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p className="text-sm font-medium">
            Уведомления на паузе до {muteUntilLabel}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 border-[var(--patient-surface-warning-border)] bg-[var(--patient-card-bg)] text-[var(--patient-surface-warning-accent)] hover:bg-[var(--patient-surface-warning-bg)]"
            disabled={pending}
            onClick={() => callMute({ mutedUntilIso: null })}
          >
            Снять паузу
          </Button>
        </div>
      ) : null}

      {!muted ? (
        <div className="flex flex-col gap-2">
          <p className={cn(patientMutedTextClass, "text-xs")}>На паузу:</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => callMute({ presetMinutes: 60 })}>
              1 ч
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => callMute({ presetMinutes: 240 })}>
              4 ч
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => callMute({ mutedUntilIso: tomorrowMorningIso(8) })}
            >
              До завтра
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => callMute({ presetMinutes: 60 * 24 * 7 })}
            >
              7 дней
            </Button>
          </div>
        </div>
      ) : null}

      {pending ? (
        <div aria-hidden className="pt-0.5">
          <PatientShimmerLine className="h-1.5 w-full max-w-sm rounded-sm" />
        </div>
      ) : null}
    </div>
  );
}
