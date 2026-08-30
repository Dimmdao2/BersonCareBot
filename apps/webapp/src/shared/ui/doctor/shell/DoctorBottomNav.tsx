'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routePaths } from '@/app-layer/routes/paths';
import { cn } from '@/lib/utils';
import { NAV_STRIP_ICON_STROKE } from '@/shared/ui/doctor/navChrome';
import {
  getDoctorMenuItems,
  isDoctorNavItemActive,
  type DoctorMenuAccess,
} from '@/shared/ui/doctor/doctorNavLinks';
import { getDoctorMenuIcon } from '@/shared/ui/doctor/doctorNavIcons';

const items = [
  { id: 'today', label: 'Сегодня', href: routePaths.doctor },
  { id: 'schedule', label: 'Расписание', href: routePaths.doctorSchedule },
  { id: 'tasks', label: 'Задачи', href: routePaths.doctorTasks },
  { id: 'patients', label: 'Клиенты', href: routePaths.doctorPatients },
  { id: 'communications', label: 'Коммуникации', href: routePaths.doctorCommunications },
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
      className="relative z-40 shrink-0 border-t border-border/70 bg-background/95 pb-[calc(env(safe-area-inset-bottom,0px)+0.125rem)] shadow-[0_-2px_6px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden"
    >
      <div className="flex h-12">
        {visibleItems.map((item) => {
          const active = isDoctorNavItemActive(item.href, pathname);
          const Icon = getDoctorMenuIcon(item.id);
          if (!Icon) return null;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              className={cn(
                'flex h-full min-w-0 flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                active && 'bg-primary/10 text-primary',
              )}
            >
              <Icon className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
