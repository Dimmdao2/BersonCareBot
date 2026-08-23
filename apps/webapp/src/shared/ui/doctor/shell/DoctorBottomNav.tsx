'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ClipboardList, Home, MessageCircle, Users } from 'lucide-react';
import { routePaths } from '@/app-layer/routes/paths';
import { cn } from '@/lib/utils';
import { NAV_STRIP_ICON_STROKE } from '@/shared/ui/doctor/navChrome';
import {
  getDoctorMenuItems,
  isDoctorNavItemActive,
  type DoctorMenuAccess,
} from '@/shared/ui/doctor/doctorNavLinks';

const items = [
  { label: 'Сегодня', href: routePaths.doctor, icon: Home },
  { label: 'Расписание', href: routePaths.doctorSchedule, icon: CalendarDays },
  { label: 'Задачи', href: routePaths.doctorTasks, icon: ClipboardList },
  { label: 'Клиенты', href: routePaths.doctorPatients, icon: Users },
  { label: 'Коммуникации', href: routePaths.doctorCommunications, icon: MessageCircle },
] as const;

export function DoctorBottomNav({
  menuAccess,
  patientLabel,
}: {
  menuAccess: DoctorMenuAccess;
  patientLabel?: string;
}) {
  const pathname = usePathname() ?? routePaths.doctor;
  const visibleHrefs = new Set(
    getDoctorMenuItems(menuAccess, patientLabel).flatMap((item) => (item.href ? [item.href] : [])),
  );
  const visibleItems = items.filter((item) => visibleHrefs.has(item.href));

  return (
    <nav
      aria-label="Основные разделы"
      className="fixed right-0 bottom-0 left-0 z-40 flex border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
    >
      {visibleItems.map((item) => {
        const active = isDoctorNavItemActive(item.href, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            title={item.label}
            className={cn(
              'flex min-h-14 min-w-0 flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              active && 'bg-primary/10 text-primary',
            )}
          >
            <Icon className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}
