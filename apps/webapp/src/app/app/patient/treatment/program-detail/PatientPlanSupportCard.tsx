"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";

/** Карточка «Поддержка» в ряду с расписанием: чат с клиникой. */
export function PatientPlanSupportCard(props: { messagesHref?: string }) {
  const href = props.messagesHref ?? routePaths.patientMessages;
  return (
    <section
      aria-labelledby="patient-plan-support-heading"
      className={cn(
        "flex min-h-0 flex-col justify-center gap-1.5 rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
        "border border-[var(--patient-surface-info-border)] bg-white px-3 py-2.5",
        "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)] md:px-3.5",
        "text-[var(--patient-color-primary)]",
      )}
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="size-[18px] shrink-0" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
        <h2 id="patient-plan-support-heading" className="m-0 text-sm font-medium leading-tight">
          Поддержка
        </h2>
      </div>
      <Link
        href={href}
        prefetch={false}
        className="text-xs font-normal leading-snug underline-offset-2 hover:underline"
      >
        Чат сообщений
      </Link>
    </section>
  );
}
