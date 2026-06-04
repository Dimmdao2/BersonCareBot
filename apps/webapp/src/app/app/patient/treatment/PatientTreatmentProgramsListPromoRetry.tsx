"use client";

import { useRouter } from "next/navigation";
import { patientMutedTextClass } from "@/shared/ui/patient/patientVisual";
import { cn } from "@/lib/utils";

/** Повтор загрузки promo/active после сбоя ensure на сервере. */
export function PatientTreatmentProgramsListPromoRetry() {
  const router = useRouter();
  return (
    <p className={cn(patientMutedTextClass, "text-sm text-destructive")} role="alert">
      Не удалось открыть программу.{" "}
      <button
        type="button"
        className="font-medium text-destructive underline underline-offset-2"
        onClick={() => router.refresh()}
      >
        Повторить
      </button>
    </p>
  );
}
