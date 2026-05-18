"use client";

import { useCallback, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import { patientCardClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import type { WebPushClientSnapshot } from "@/shared/lib/webPush/useWebPushClientState";

type Props = {
  state: WebPushClientSnapshot;
};

export function PatientWebPushOnboardingCard({ state }: Props) {
  const [busy, setBusy] = useState(false);
  const [deniedHint, setDeniedHint] = useState(false);

  const onEnable = useCallback(async () => {
    setBusy(true);
    setDeniedHint(false);
    try {
      const result = await subscribePatientWebPush();
      if (result.ok) {
        await state.refresh();
        return;
      }
      if (result.reason === "permission_denied") {
        setDeniedHint(true);
      }
    } finally {
      setBusy(false);
    }
  }, [state]);

  const onDismiss = useCallback(() => {
    state.dismissOnboardingPrompt();
  }, [state]);

  if (!state.showOnboardingPrompt) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-[max(4.5rem,calc(4.5rem+env(safe-area-inset-bottom,0px)))] z-40 px-4",
        "md:bottom-6 md:left-1/2 md:max-w-lg md:-translate-x-1/2 md:px-0",
      )}
      role="region"
      aria-label="Включите уведомления"
    >
      <div className={cn(patientCardClass, "border-[var(--patient-border)] bg-[var(--patient-card-bg)] p-4 shadow-lg")}>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--patient-surface-info-bg)] text-[var(--patient-surface-info-accent)]">
            <Bell className="size-4" aria-hidden />
          </span>
          <p className="text-base font-semibold text-[var(--patient-text-primary)]">Включите уведомления</p>
        </div>
        {deniedHint ? (
          <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>
            Уведомления отключены. Их можно включить вручную в настройках телефона.
          </p>
        ) : (
          <p className={cn(patientMutedTextClass, "mt-2 text-sm")}>
            Так вы сможете получать напоминания о тренировках, обновления плана и важные сообщения по программе.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {!deniedHint ? (
            <Button type="button" className="w-full sm:flex-1" disabled={busy} onClick={() => void onEnable()}>
              Включить уведомления
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full sm:flex-1"
            disabled={busy}
            onClick={onDismiss}
          >
            {deniedHint ? "Закрыть" : "Не сейчас"}
          </Button>
        </div>
      </div>
    </div>
  );
}
