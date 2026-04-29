"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  LayoutGrid,
} from "lucide-react";
import {
  getPatientPrimaryNavActiveId,
  PATIENT_MOBILE_SHELL_MAX_PX,
  PATIENT_PRIMARY_NAV_ITEMS,
  type PatientPrimaryNavItemId,
} from "@/app-layer/routes/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<PatientPrimaryNavItemId, typeof LayoutGrid> = {
  today: LayoutGrid,
  booking: CalendarCheck,
  warmups: Dumbbell,
  plan: ClipboardList,
  diary: BookOpen,
};

/** Нижняя primary-навигация пациента: только &lt; lg (скрытие через родителя `lg:hidden`). */
export function PatientBottomNav() {
  const pathname = usePathname();
  const activeId = getPatientPrimaryNavActiveId(pathname);

  return (
    <nav
      id="patient-bottom-nav"
      aria-label="Основная навигация"
      data-patient-mobile-max-px={PATIENT_MOBILE_SHELL_MAX_PX}
      className={cn(
        "fixed bottom-0 left-1/2 z-50 w-full -translate-x-1/2 border-t border-[var(--patient-border)] bg-[var(--patient-surface)]",
        "min-h-[72px] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1 shadow-[var(--patient-shadow-nav)]",
        "lg:hidden",
      )}
      style={{ maxWidth: PATIENT_MOBILE_SHELL_MAX_PX, width: "100%" }}
    >
      <ul className="mx-auto flex w-full max-w-full items-stretch justify-between gap-0.5 px-1">
        {PATIENT_PRIMARY_NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.id];
          const isActive = activeId === item.id;
          const isWarmupsCenter = item.id === "warmups";
          return (
            <li key={item.id} className="min-w-0 flex-1">
              <Link
                href={item.href}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[11px] font-medium leading-tight",
                  "text-[var(--patient-text-muted)] transition-colors",
                  isActive && "text-[var(--patient-color-primary)]",
                  isActive && isWarmupsCenter && "ring-1 ring-[var(--patient-color-primary)]/35",
                  isActive && !isWarmupsCenter && "bg-[var(--patient-color-primary-soft)]/40",
                )}
              >
                <Icon className="size-[22px] shrink-0" aria-hidden />
                <span className="line-clamp-2 text-center">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
