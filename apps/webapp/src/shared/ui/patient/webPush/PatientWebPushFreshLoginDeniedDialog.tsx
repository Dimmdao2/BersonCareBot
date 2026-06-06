"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/patient/primitives/dialog";
import { cn } from "@/lib/utils";
import { useWebPushClientState } from "@/shared/lib/webPush/PatientWebPushContext";
import { subscribePatientWebPush } from "@/shared/lib/webPush/subscribePatientWebPush";
import { reportWebPushSubscribeFailure } from "@/shared/lib/webPush/webPushSubscribeFeedback";
import {
  patientButtonSecondaryClass,
  patientModalPortalPrimaryCtaClass,
  patientMutedTextClass,
  patientPortalModalSurfaceClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";

/** После свежего входа при system-denied — короткий призыв включить уведомления в настройках ОС. */
export function PatientWebPushFreshLoginDeniedDialog() {
  const state = useWebPushClientState();
  const [busy, setBusy] = useState(false);

  const onOpenSettings = useCallback(async () => {
    setBusy(true);
    try {
      const result = await subscribePatientWebPush();
      if (result.ok) {
        await state.refresh();
      } else {
        reportWebPushSubscribeFailure(result);
      }
    } finally {
      setBusy(false);
    }
  }, [state]);

  return (
    <Dialog
      open={state.showFreshLoginDeniedPrompt}
      onOpenChange={(open) => {
        if (!open) state.dismissFreshLoginDeniedPrompt();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          patientPortalModalSurfaceClass,
          "max-w-[min(22rem,calc(100%_-_1.5rem))] gap-0 rounded-[var(--patient-card-radius-mobile)] border border-[#e5e7eb] p-4 shadow-[0_8px_24px_rgba(15,23,42,0.12)] sm:max-w-sm sm:rounded-[var(--patient-card-radius-desktop)] sm:p-5",
        )}
        aria-describedby="patient-web-push-fresh-login-denied-desc"
      >
        <DialogHeader className="gap-3 text-left">
          <DialogTitle className={cn(patientSectionTitleClass, "text-left")}>
            Уведомления отключены
          </DialogTitle>
        </DialogHeader>
        <p
          id="patient-web-push-fresh-login-denied-desc"
          className={cn(patientMutedTextClass, "mt-3 text-sm leading-relaxed")}
        >
          Включите уведомления для приложения в настройках устройства, чтобы получать напоминания.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className={patientModalPortalPrimaryCtaClass}
            disabled={busy}
            onClick={() => void onOpenSettings()}
          >
            Открыть настройки
          </button>
          <button
            type="button"
            className={cn(
              patientButtonSecondaryClass,
              "border-[#e5e7eb] bg-[#ffffff] hover:bg-[#e8eefb]/40 active:bg-[#e8eefb]/60",
            )}
            disabled={busy}
            onClick={state.dismissFreshLoginDeniedPrompt}
          >
            Позже
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
