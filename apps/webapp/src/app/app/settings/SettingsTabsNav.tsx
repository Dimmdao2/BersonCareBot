"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type SettingsTab =
  | "specialist"
  | "integrations"
  | "schedule"
  | "app"
  | "admin"
  | "technical";

export const SETTINGS_TABS: { id: SettingsTab; label: string; adminOnly?: boolean }[] = [
  { id: "specialist", label: "Специалист" },
  { id: "integrations", label: "Интеграции" },
  { id: "schedule", label: "Запись и расписание" },
  { id: "app", label: "Приложение" },
  { id: "admin", label: "Администрирование", adminOnly: true },
  { id: "technical", label: "Техническое", adminOnly: true },
];

export function SettingsTabsNav({ isAdmin }: { isAdmin: boolean }) {
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") ?? "specialist") as SettingsTab;

  const visibleTabs = SETTINGS_TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-border pb-0">
      {visibleTabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={`?tab=${tab.id}`}
            className={cn(
              "relative inline-flex items-center px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              "border-b-2 -mb-px",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
