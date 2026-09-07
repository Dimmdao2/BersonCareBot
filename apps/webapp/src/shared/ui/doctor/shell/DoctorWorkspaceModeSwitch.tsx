'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';

/** A navigation preference only; server guards remain the authority for both modes. */
export function DoctorWorkspaceModeSwitch() {
  const pathname = usePathname() ?? '/app/doctor';
  const managementActive =
    pathname.startsWith('/app/manage') || pathname.startsWith('/app/settings');

  return (
    <nav aria-label="Режим кабинета" className="flex min-w-0 gap-1">
      <Link
        href="/app/doctor"
        className={cn(doctorSectionTabClass(!managementActive), 'whitespace-nowrap')}
        aria-current={!managementActive ? 'page' : undefined}
      >
        Работа специалиста
      </Link>
      <Link
        href="/app/manage"
        className={cn(doctorSectionTabClass(managementActive), 'whitespace-nowrap')}
        aria-current={managementActive ? 'page' : undefined}
      >
        Управление клиникой
      </Link>
    </nav>
  );
}
