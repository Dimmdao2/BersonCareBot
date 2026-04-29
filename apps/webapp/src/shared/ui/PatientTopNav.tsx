"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  LayoutGrid,
  MessageCircle,
  Stethoscope,
  UserCircle,
} from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  getPatientPrimaryNavActiveId,
  PATIENT_PRIMARY_NAV_ITEMS,
  type PatientPrimaryNavItemId,
} from "@/app-layer/routes/navigation";
import { cn } from "@/lib/utils";
import { useReminderUnreadCount } from "@/shared/hooks/useReminderUnread";

const NAV_ICONS: Record<PatientPrimaryNavItemId, typeof LayoutGrid> = {
  today: LayoutGrid,
  booking: CalendarCheck,
  warmups: Dumbbell,
  plan: ClipboardList,
  diary: BookOpen,
};

const TOP_ICON_BTN =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-md text-[var(--patient-text-primary)] hover:bg-[var(--patient-color-primary-soft)]/50";

/** Верхняя primary-навигация пациента: только lg+ (скрытие через родителя `hidden lg:block`). */
export function PatientTopNav() {
  const pathname = usePathname();
  const activeId = getPatientPrimaryNavActiveId(pathname);
  const reminderUnread = useReminderUnreadCount(true);

  return (
    <div
      id="patient-top-nav"
      className="border-b border-[var(--patient-border)] bg-[var(--patient-surface)] shadow-sm"
    >
      <div className="mx-auto flex h-16 w-full max-w-[min(1180px,calc(100vw-2rem))] items-center gap-4 px-4">
        <Link
          href={routePaths.patient}
          prefetch={false}
          className="flex shrink-0 items-center gap-2 text-[var(--patient-text-primary)]"
        >
          <Stethoscope className="size-6 text-[var(--patient-color-primary)]" aria-hidden />
          <span className="text-lg font-bold tracking-tight">BersonCare</span>
        </Link>
        <nav aria-label="Основная навигация" className="flex min-w-0 flex-1 justify-center gap-1">
          {PATIENT_PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.id];
            const isActive = activeId === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 min-w-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium",
                  "text-[var(--patient-text-muted)] transition-colors",
                  isActive && "bg-[var(--patient-color-primary-soft)]/50 text-[var(--patient-color-primary)]",
                  !isActive && "hover:bg-muted/60",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={routePaths.patientReminders}
            prefetch={false}
            aria-label="Напоминания"
            className={cn(TOP_ICON_BTN, "relative")}
          >
            <Bell className="size-[22px]" aria-hidden />
            {reminderUnread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {reminderUnread > 99 ? "99+" : reminderUnread}
              </span>
            ) : null}
          </Link>
          <Link href={routePaths.patientMessages} prefetch={false} aria-label="Сообщения" className={TOP_ICON_BTN}>
            <MessageCircle className="size-[22px]" aria-hidden />
          </Link>
          <Link href={routePaths.profile} prefetch={false} aria-label="Профиль" className={TOP_ICON_BTN}>
            <UserCircle className="size-[22px]" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
