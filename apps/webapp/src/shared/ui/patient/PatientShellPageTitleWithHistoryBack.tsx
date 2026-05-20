"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const router = useRouter();

  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (fallbackHref) {
      router.push(fallbackHref);
    }
  }, [router, fallbackHref]);

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
