import Link from 'next/link';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';

export type AccountTab = 'account' | 'security' | 'notifications';

const ACCOUNT_TABS: ReadonlyArray<{ id: AccountTab; label: string }> = [
  { id: 'account', label: 'Аккаунт' },
  { id: 'security', label: 'Безопасность' },
  { id: 'notifications', label: 'Уведомления' },
];

export function AccountTabs({ activeTab }: { activeTab: AccountTab }) {
  return (
    <nav className="min-w-0 max-w-full" aria-label="Разделы аккаунта">
      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ACCOUNT_TABS.map((tab) => {
          const isSelected = tab.id === activeTab;
          const href = tab.id === 'account' ? '/app/account' : `/app/account?tab=${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              className={doctorSectionTabClass(isSelected)}
              aria-current={isSelected ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
