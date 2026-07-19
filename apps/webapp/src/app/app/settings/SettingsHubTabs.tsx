import Link from "next/link";
import { cn } from "@/lib/utils";

export type SettingsHubTab = "specialist" | "organization" | "billing" | "install";

export type SettingsHubTabItem = {
  id: SettingsHubTab;
  label: string;
};

export function SettingsHubTabs({ activeTab, tabs }: { activeTab: SettingsHubTab; tabs: SettingsHubTabItem[] }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Разделы настроек">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.id === "specialist" ? "/app/settings" : `/app/settings?tab=${tab.id}`}
          className={cn(
            "inline-flex h-8 items-center rounded-md px-3 text-sm transition-colors",
            tab.id === activeTab ? "bg-primary/15 text-primary" : "hover:bg-muted",
          )}
          aria-current={tab.id === activeTab ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
