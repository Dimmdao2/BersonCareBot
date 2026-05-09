"use client";

import { useTransition } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { patientCardClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

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
    <div className="mb-4 space-y-3">
      {muted ? (
        <Card className={cn(patientCardClass, "border-[#fde68a] bg-[#fffbeb]")}>
          <CardContent className="flex flex-col gap-3 pb-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[#92400e]">
              Уведомления на паузе до {muteUntilLabel}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 border-[#92400e]/40 text-[#92400e] hover:bg-[#fff7ed]"
              disabled={pending}
              onClick={() => callMute({ mutedUntilIso: null })}
            >
              Снять паузу
            </Button>
          </CardContent>
        </Card>
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
    </div>
  );
}
