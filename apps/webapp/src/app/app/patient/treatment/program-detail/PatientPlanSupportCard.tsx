"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/patient/navChrome";

/** Компактная ссылка «Поддержка» в одной строке с блоком расписания. */
export function PatientPlanSupportCard(props: { messagesHref?: string }) {
  const href = props.messagesHref ?? routePaths.patientMessages;
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
        "border border-[var(--patient-surface-info-border)] bg-white px-3 py-2",
        "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
        "text-sm font-medium leading-tight whitespace-nowrap text-[var(--patient-color-primary)]",
        "ring-offset-background focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2 focus-visible:outline-none",
      )}
    >
      <MessageCircle className="size-[18px] shrink-0" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
      Поддержка
    </Link>
  );
}
