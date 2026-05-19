"use client";

import { useCallback, useState } from "react";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import { subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import {
  patientButtonSecondaryClass,
  patientModalPortalPrimaryCtaClass,
  patientMutedTextClass,
  patientPortalModalSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";

export function PatientWebPushOnboardingCard() {
  const state = useWebPushClientState();
  const [busy, setBusy] = useState(false);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      await subscribePatientWebPush();
      await state.refresh();
    } finally {
      setBusy(false);
    }
  }, [state]);

  const onDismiss = useCallback(() => {
    state.dismissOnboardingPrompt();
  }, [state]);

  return (
    <Dialog
      open={state.showOnboardingPrompt}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          patientPortalModalSurfaceClass,
          "max-w-[min(22rem,calc(100%-1.5rem))] gap-0 rounded-[var(--patient-card-radius-mobile)] border border-[#e5e7eb] p-4 shadow-[0_8px_24px_rgba(15,23,42,0.12)] sm:max-w-sm sm:rounded-[var(--patient-card-radius-desktop)] sm:p-5",
        )}
        aria-describedby="patient-web-push-onboarding-desc"
      >
        <DialogHeader className="gap-3 text-left">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e8eefb] text-[#284da0]"
            aria-hidden
          >
            <Bell className="size-5" />
          </span>
          <DialogTitle className={cn(patientSectionTitleClass, "text-left")}>
            Включите уведомления
          </DialogTitle>
        </DialogHeader>
        <p
          id="patient-web-push-onboarding-desc"
          className={cn(patientMutedTextClass, "mt-3 text-sm leading-relaxed")}
        >
          Так вы сможете получать напоминания о тренировках, обновления плана и важные сообщения по
          программе.
        </p>
        <PushOnboardingActions busy={busy} onEnable={onEnable} onDismiss={onDismiss} />
      </DialogContent>
    </Dialog>
  );
}

function PushOnboardingActions({
  busy,
  onEnable,
  onDismiss,
}: {
  busy: boolean;
  onEnable: () => void | Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-2">
      <button
        type="button"
        className={patientModalPortalPrimaryCtaClass}
        disabled={busy}
        onClick={() => void onEnable()}
      >
        Включить уведомления
      </button>
      <button
        type="button"
        className={cn(
          patientButtonSecondaryClass,
          "border-[#e5e7eb] bg-[#ffffff] hover:bg-[#e8eefb]/40 active:bg-[#e8eefb]/60",
        )}
        disabled={busy}
        onClick={onDismiss}
      >
        Не сейчас
      </button>
    </div>
  );
}
