import Link from "next/link";
import { cn } from "@/lib/utils";
import { DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { doctorSectionTabClass } from "@/shared/ui/doctor/DoctorSectionTabs";
import { ALL_SETTINGS_TABS, type SettingsTabId } from "./settingsTabs";

type Props = {
  activeTab: SettingsTabId;
  /** Sections the current user may access — a section outside this list is never rendered. */
  visibleTabs: SettingsTabId[];
};

/**
 * Sticky section nav for `/app/settings`, mirroring the `BookingAdminTabsNav` /
 * `DoctorCommunicationsTabsNav` idiom (`doctorSectionTabClass` + a Link per tab; the shared
 * gate-vs-render split lives in `page.tsx`, this component only ever renders what it is told is
 * visible — it never links to a section the viewer cannot open).
 */
export function SettingsTabsNav({ activeTab, visibleTabs }: Props) {
  const tabs = ALL_SETTINGS_TABS.filter((tab) => visibleTabs.includes(tab.id));
  if (tabs.length < 2) return null;

  return (
    <nav
      className={cn(
        "sticky z-20 -mx-3 mb-4 border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-md supports-backdrop-filter:bg-background/90",
        DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
      )}
      aria-label="Разделы настроек"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={doctorSectionTabClass(active)}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
