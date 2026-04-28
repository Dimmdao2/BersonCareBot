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
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/80 bg-[var(--patient-surface)] pb-[env(safe-area-inset-bottom,0px)] pt-1 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
    >
      <div className="mx-auto flex max-w-[480px] items-stretch justify-around px-1 lg:max-w-6xl">
        {PATIENT_BOTTOM_NAV_ITEMS.map(({ href, label, Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium leading-tight",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[22px] shrink-0", active ? "text-primary" : undefined)} aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
