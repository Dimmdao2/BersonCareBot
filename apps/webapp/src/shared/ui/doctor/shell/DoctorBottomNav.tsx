'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { routePaths } from '@/app-layer/routes/paths';
import { cn } from '@/lib/utils';
import { NAV_STRIP_ICON_STROKE } from '@/shared/ui/doctor/navChrome';
import {
  getDoctorMenuItems,
  isDoctorNavItemActive,
  type DoctorMenuAccess,
} from '@/shared/ui/doctor/doctorNavLinks';
import { getDoctorMenuIcon } from '@/shared/ui/doctor/doctorNavIcons';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { useOptionalDoctorShellBadgeCounts } from '@/shared/ui/doctor/shell/DoctorSupportUnreadProvider';
import { resolveSpecialistTaskAttentionTone } from '@/modules/specialist-tasks/taskPriority';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { useReportShellChromeHeight } from '@/shared/hooks/useReportShellChromeHeight';

export const DOCTOR_BOTTOM_NAV_HEIGHT_VAR = '--doctor-bottom-nav-height';

const items = [
  { id: 'today', href: routePaths.doctor },
  {
    id: 'schedule',
    href: `${routePaths.doctorSchedule}?view=3days`,
    accessHref: routePaths.doctorSchedule,
  },
  { id: 'tasks', href: routePaths.doctorTasks },
  { id: 'patients', href: routePaths.doctorPatients },
  { id: 'communications', href: routePaths.doctorCommunications },
] as const;

export function DoctorBottomNav({
  menuAccess,
}: {
  menuAccess: DoctorMenuAccess;
  patientLabel?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const terms = useDoctorPatientTerms();
  const pathname = usePathname() ?? routePaths.doctor;
  const { messagesUnread, unreadExerciseComments, overdueTasks, todayTasks } =
    useOptionalDoctorShellBadgeCounts();
  const menuItemsByHref = new Map(
    getDoctorMenuItems(menuAccess, terms).flatMap((item) =>
      item.href ? [[item.href, item] as const] : [],
    ),
  );
  const visibleItems = items.flatMap((item) => {
    const menuItem = menuItemsByHref.get('accessHref' in item ? item.accessHref : item.href);
    return menuItem ? [{ ...item, label: menuItem.label }] : [];
  });

  useReportShellChromeHeight(navRef, DOCTOR_BOTTOM_NAV_HEIGHT_VAR);

  return (
    <nav
      ref={navRef}
      aria-label="Основные разделы"
      className="relative z-40 shrink-0 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-2px_6px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden"
    >
      <div className="flex h-12">
        {visibleItems.map((item) => {
          const label = item.label;
          const active = isDoctorNavItemActive(
            'accessHref' in item ? item.accessHref : item.href,
            pathname,
          );
          const Icon = getDoctorMenuIcon(item.id);
          if (!Icon) return null;
          const hasAttention =
            item.id === 'communications'
              ? messagesUnread + unreadExerciseComments > 0
              : item.id === 'tasks'
                ? overdueTasks > 0 || todayTasks > 0
                : false;
          const taskAttentionTone =
            resolveSpecialistTaskAttentionTone(overdueTasks, todayTasks) ?? 'primary';
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-label={
                hasAttention
                  ? item.id === 'tasks'
                    ? overdueTasks > 0
                      ? `${label}. Есть просроченные задачи.`
                      : `${label}. Есть задачи на сегодня.`
                    : `${label}. Есть непрочитанные.`
                  : label
              }
              aria-current={active ? 'page' : undefined}
              title={label}
              className={cn(
                'flex h-full min-w-0 flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                active && 'bg-primary/10 text-primary',
              )}
            >
              <span className="relative inline-flex">
                <Icon className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
                <DoctorAttentionBadge
                  count={hasAttention ? 1 : 0}
                  dot
                  tone={item.id === 'tasks' ? taskAttentionTone : 'danger'}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
