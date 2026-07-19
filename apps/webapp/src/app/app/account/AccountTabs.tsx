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

export type AccountTab = "profile" | "notifications" | "install";

const ACCOUNT_TABS: ReadonlyArray<{ id: AccountTab; label: string }> = [
  { id: "profile", label: "Профиль" },
  { id: "notifications", label: "Уведомления" },
  { id: "install", label: "Установить приложение" },
];

export function AccountTabs({ activeTab }: { activeTab: AccountTab }) {
  return (
    <nav aria-label="Разделы аккаунта">
      <ul className={doctorDnaFlatListClass}>
        {ACCOUNT_TABS.map((tab, index) => {
          const isSelected = tab.id === activeTab;
          const href = tab.id === "profile" ? "/app/account" : `/app/account?tab=${tab.id}`;
          return (
            <li key={tab.id}>
              <Link
                href={href}
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
