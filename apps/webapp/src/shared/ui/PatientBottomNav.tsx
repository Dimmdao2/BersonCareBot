"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PATIENT_BOTTOM_NAV_ITEMS } from "@/app-layer/routes/navigation";
import { cn } from "@/lib/utils";

/**
 * Фиксированное нижнее меню пациента (Сегодня / Запись / Разминки / План / Дневник).
 */
export function PatientBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      id="patient-bottom-nav"
      role="navigation"
      aria-label="Основная навигация пациента"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--patient-border)] bg-[rgba(255,255,255,0.96)] pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] pt-2 shadow-[var(--patient-shadow-nav)] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-[430px] items-stretch justify-around px-1">
        {PATIENT_BOTTOM_NAV_ITEMS.map(({ href, label, Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-[11px] leading-4 transition-colors",
                active ?
                  "font-bold text-[var(--patient-color-primary)]"
                : "font-medium text-[var(--patient-text-secondary)] hover:text-[var(--patient-text-primary)]",
              )}
            >
              <Icon className={cn("size-6 shrink-0", active && "size-[26px]")} aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
