'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BOOKING_ADMIN_TABS,
  bookingAdminTabFromPathname,
} from '@/app/app/doctor/admin/booking/bookingAdminTabs';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';

export function BookingAdminTabsNav() {
  const pathname = usePathname();
  const activeId = bookingAdminTabFromPathname(pathname);

  return (
    <nav className="min-w-0 max-w-full" aria-label="Разделы настроек записи">
      <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BOOKING_ADMIN_TABS.map((tab) => {
          const active = tab.id === activeId;
          return (
            <Link key={tab.id} href={tab.href} className={doctorSectionTabClass(active)}>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
