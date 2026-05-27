"use client";

import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePatientShellGoBack } from "@/shared/hooks/usePatientShellGoBack";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";
import { patientSectionTitleClass } from "@/shared/ui/patientVisual";

type Props = {
  title: string;
  backLabel?: string;
  /** Если в истории некуда вернуться — переход по ссылке (напр. профиль). */
  fallbackHref?: string;
};

/** Заголовок под {@link PatientTopNav}: стрелка «назад» (history) слева от названия страницы. */
export function PatientShellPageTitleWithHistoryBack({
  title,
  backLabel = "Назад",
  fallbackHref,
}: Props) {
  const goBack = usePatientShellGoBack(fallbackHref);

  return (
    <div className="flex min-w-0 items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-ml-2.5 size-10 shrink-0 text-[var(--patient-text-primary)]"
        onClick={goBack}
        aria-label={backLabel}
      >
        <ChevronLeft className="size-5" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
      </Button>
      <h1 className={cn(patientSectionTitleClass, "min-w-0 flex-1 truncate pl-3")}>{title}</h1>
    </div>
  );
}
