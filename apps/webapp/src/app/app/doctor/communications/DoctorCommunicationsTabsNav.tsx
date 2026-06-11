import Link from "next/link";
import { cn } from "@/lib/utils";
import { DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import {
  COMMUNICATIONS_TABS,
  type CommunicationsTabId,
} from "./doctorCommunicationsTabs";

type Props = {
  /** Активная вкладка — страница знает свою (chats/intake/comments/broadcasts). */
  activeTab: CommunicationsTabId;
  /**
   * Опциональные счётчики-бейджи на вкладках. Страница передаёт то, что уже загрузила.
   * Кросс-вкладочная синхронизация бейджей — TODO (см. communications.md).
   */
  badges?: Partial<Record<CommunicationsTabId, number>>;
};

/**
 * Единый таб-бар экрана «Коммуникации». Зеркалит паттерн `BookingAdminTabsNav`:
 * sticky-полоса со ссылками на агрегатные URL `/communications?tab=<id>`.
 */
export function DoctorCommunicationsTabsNav({ activeTab, badges }: Props) {
  return (
    <nav
      id="doctor-communications-tabs"
      className={cn(
        "sticky z-20 -mx-3 mb-4 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-md supports-backdrop-filter:bg-background/90",
        DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
      )}
      aria-label="Разделы коммуникаций"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {COMMUNICATIONS_TABS.map((tab) => {
          const active = tab.id === activeTab;
          const badge = badges?.[tab.id];
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
              {badge && badge > 0 ? (
                <span
                  className={cn(
                    "inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
