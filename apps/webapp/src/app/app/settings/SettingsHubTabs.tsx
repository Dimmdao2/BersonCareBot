import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DoctorDnaFlatListSelectionStrip,
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSelectedPrimaryClass,
} from "@/shared/ui/doctor/DoctorDnaFlatListRow";

export type SettingsHubTab = "specialist" | "organization" | "team" | "billing" | "install";

export type SettingsHubTabItem = {
  id: SettingsHubTab;
  label: string;
};

export function SettingsHubTabs({ activeTab, tabs }: { activeTab: SettingsHubTab; tabs: SettingsHubTabItem[] }) {
  return (
    <nav aria-label="Разделы настроек">
      <ul className={doctorDnaFlatListClass}>
        {tabs.map((tab, index) => {
          const isSelected = tab.id === activeTab;
          return (
            <li key={tab.id}>
              <Link
                href={tab.id === "specialist" ? "/app/settings" : `/app/settings?tab=${tab.id}`}
                className={cn(
                  doctorDnaFlatListRowClass,
                  doctorDnaFlatListClickableClass,
                  "w-full",
                  index === 0 && "border-t-0",
                  doctorDnaFlatListPrimaryClass,
                  isSelected && doctorDnaFlatListSelectedPrimaryClass,
                )}
                aria-current={isSelected ? "page" : undefined}
              >
                {isSelected ? <DoctorDnaFlatListSelectionStrip /> : null}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
