"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarPlus,
  ChartLine,
  Dumbbell,
  Home,
  MessageCircle,
} from "lucide-react";
import {
  getPatientPrimaryNavActiveId,
  PATIENT_PRIMARY_NAV_ITEMS,
  type PatientPrimaryNavItem,
  type PatientPrimaryNavItemId,
} from "@/app-layer/routes/navigation";
import { cn } from "@/lib/utils";
import { usePatientSupportUnreadCount } from "@/modules/messaging/hooks/useSupportUnreadPolling";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";

const NAV_ICONS: Record<PatientPrimaryNavItemId, typeof Home> = {
  today: Home,
  booking: CalendarPlus,
  diary: ChartLine,
  plan: Dumbbell,
  messages: MessageCircle,
};

function navLinkAriaLabel(label: string, showChatDot: boolean): string {
  return showChatDot ? `${label}, есть новые сообщения` : label;
}

type Props = {
  className?: string;
  /** Компактные подписи (нижняя полоска mobile). */
  variant?: "bottom" | "inline";
};

/** Primary nav: вкладки «Сегодня / Упражнения / … / Чат». */
export function PatientPrimaryNavStrip({ className, variant = "bottom" }: Props) {
  const pathname = usePathname() ?? "";
  const activeId = getPatientPrimaryNavActiveId(pathname);
  const chatUnread = usePatientSupportUnreadCount();

  const renderNavLink = (item: PatientPrimaryNavItem) => {
    const Icon = NAV_ICONS[item.id];
    const isActive = activeId === item.id;
    const showChatDot = item.id === "messages" && chatUnread > 0;
    const ariaLabel = navLinkAriaLabel(item.label, showChatDot);

    if (variant === "inline") {
      return (
        <Link
          key={item.id}
          href={item.href}
          prefetch={false}
          aria-label={ariaLabel}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm",
            isActive ?
              "bg-[var(--patient-color-primary-soft)]/50 font-medium text-[var(--patient-color-primary)]"
            : "font-normal text-[var(--patient-text-secondary)] hover:text-[var(--patient-color-primary)]",
          )}
        >
          <span className="relative inline-flex shrink-0">
            <Icon className="size-[18px] shrink-0" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
            {showChatDot ? (
              <span
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#c0392b] ring-2 ring-white"
                aria-hidden
              />
            ) : null}
          </span>
          <span className="truncate">{item.label}</span>
        </Link>
      );
    }

    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={false}
        aria-label={ariaLabel}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1.5",
          isActive ?
            "font-medium text-[var(--patient-color-primary)]"
          : "font-normal text-[var(--patient-text-secondary)] hover:font-normal hover:text-[var(--patient-color-primary)]",
        )}
      >
        <span className="relative inline-flex shrink-0">
          <Icon
            className={cn(
              "size-5 shrink-0 transition-colors duration-200 ease-out",
              isActive ?
                "size-[22px] text-[var(--patient-color-primary)]"
              : "text-[var(--patient-text-secondary)] group-hover:text-[var(--patient-color-primary)]",
            )}
            strokeWidth={NAV_STRIP_ICON_STROKE}
            aria-hidden
          />
          {showChatDot ? (
            <span
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#c0392b] ring-2 ring-white"
              aria-hidden
            />
          ) : null}
        </span>
        <span className="w-full truncate text-center text-[10px] leading-3">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Основная навигация пациента"
      className={cn(
        variant === "bottom" ?
          "flex w-full min-w-0 items-stretch justify-around"
        : "flex w-full min-w-0 items-stretch justify-center gap-1",
        className,
      )}
    >
      {PATIENT_PRIMARY_NAV_ITEMS.map(renderNavLink)}
    </nav>
  );
}
