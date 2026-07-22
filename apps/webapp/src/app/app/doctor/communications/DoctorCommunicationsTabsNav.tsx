import Link from "next/link";
import { cn } from "@/lib/utils";
import { DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { doctorSectionTabClass } from "@/shared/ui/doctor/DoctorSectionTabs";
import {
  COMMUNICATIONS_TABS,
  type CommunicationsTabId,
} from "./doctorCommunicationsTabs";

type Props = {
  /** Активная вкладка — страница знает свою (chats/intake/comments/broadcasts). */
  activeTab: CommunicationsTabId;
  /**
   * Опциональные счётчики-бейджи на вкладках. Страница передаёт то, что уже загрузила.
   */
  badges?: Partial<Record<CommunicationsTabId, number>>;
  /**
   * Если задан — клики по табам вызывают обработчик вместо перехода по Link.
   * Используется в DoctorCommunicationsShell для мгновенного переключения без навигации.
   */
  onTabClick?: (tab: CommunicationsTabId) => void;
};

/**
 * Единый таб-бар экрана «Коммуникации». Зеркалит паттерн `BookingAdminTabsNav`:
 * sticky-полоса со ссылками на агрегатные URL `/communications?tab=<id>`.
 */
export function DoctorCommunicationsTabsNav({ activeTab, badges, onTabClick }: Props) {
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
          const itemClass = doctorSectionTabClass(active);
          const badgeEl =
            badge && badge > 0 ? (
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
            ) : null;

          return onTabClick ? (
            <Button
              key={tab.id}
              type="button"
              variant="ghost"
              aria-current={active ? "page" : undefined}
              onClick={() => onTabClick(tab.id)}
              className={itemClass}
            >
              {tab.label}
              {badgeEl}
            </Button>
          ) : (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={itemClass}
            >
              {tab.label}
              {badgeEl}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
