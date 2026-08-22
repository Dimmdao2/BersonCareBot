'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Stethoscope } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { routePaths } from '@/app-layer/routes/paths';
import { cn } from '@/lib/utils';
import { DoctorMenuAccordion } from '@/shared/ui/doctor/shell/DoctorMenuAccordion';
import { DOCTOR_MENU_ITEM_RADIUS_CLASS, NAV_STRIP_ICON_STROKE } from '@/shared/ui/doctor/navChrome';
import {
  DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS,
  DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import type { DoctorMenuAccess } from '@/shared/ui/doctor/doctorNavLinks';

type DoctorAdminSidebarProps = {
  userDisplayName?: string;
  menuAccess: DoctorMenuAccess;
  /** Если `"клиент"`, пункт «Пациенты» отображается как «Клиенты». */
  patientLabel?: string;
  enableBadgePolling?: boolean;
  homeHref?: string;
  /**
   * UX-05 B2: server-resolved effective organization brand. Degrades to the platform "Therapysto"
   * mark when absent (account/global-admin/manage shells never pass it).
   */
  brand?: { displayName: string; logoUrl: string | null };
  /** Which item source `DoctorMenuAccordion` renders. See `DoctorMenuAccordionProps.menuKind`. */
  menuKind?: 'doctor' | 'platform';
};

/**
 * Левое меню разделов кабинета на md+ (бренд-блок сверху + разделы); глобальной шапки на desktop нет,
 * сайдбар липнет к верху вьюпорта. На мобильных скрыто (разделы — в Sheet мобильной `DoctorHeader`).
 */
export function DoctorAdminSidebar({
  userDisplayName,
  menuAccess,
  patientLabel,
  enableBadgePolling,
  homeHref = routePaths.doctor,
  brand,
  menuKind = 'doctor',
}: DoctorAdminSidebarProps) {
  const pathname = usePathname() ?? '/app/doctor';

  return (
    <aside
      id="doctor-admin-sidebar"
      className={cn(
        'hidden md:flex',
        DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS,
        'shrink-0 flex-col border-r border-border/70 bg-background pb-4 pl-3 pr-2 pt-3',
        'md:sticky md:self-start md:overflow-y-auto',
        // Глобальной шапки на desktop нет → сайдбар липнет к верху вьюпорта и занимает всю высоту.
        'md:max-h-[calc(100dvh_-_0.5rem)]',
        DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS,
      )}
      aria-label="Разделы кабинета"
    >
      <Link
        href={homeHref}
        prefetch={false}
        id="doctor-sidebar-brand"
        className={cn(
          'mb-3 flex items-center gap-2 rounded-lg px-2 py-1.5 no-underline',
          'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/5 text-foreground"
          aria-hidden
        >
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- small chrome mark, server-validated /api/media URL
            <img src={brand.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Stethoscope className="size-[18px]" strokeWidth={NAV_STRIP_ICON_STROKE} />
          )}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            {brand?.displayName ?? 'Therapysto'}
          </span>
          <span className="truncate text-xs text-muted-foreground">Therapysto</span>
        </span>
      </Link>
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Разделы
      </p>
      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
        aria-label="Разделы кабинета"
      >
        <DoctorMenuAccordion
          variant="sidebar"
          pathname={pathname}
          menuAccess={menuAccess}
          patientLabel={patientLabel}
          enableBadgePolling={enableBadgePolling}
          menuKind={menuKind}
        />
        <form action="/api/auth/logout" method="post" className="w-full">
          <Button
            type="submit"
            variant="ghost"
            id="doctor-sidebar-logout"
            className={cn(
              DOCTOR_MENU_ITEM_RADIUS_CLASS,
              'h-auto w-full justify-start px-3 py-2 text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive',
            )}
          >
            Выйти
          </Button>
        </form>
      </nav>
      {userDisplayName ? (
        <p className="mt-3 truncate px-3 text-xs text-muted-foreground" title={userDisplayName}>
          {userDisplayName}
        </p>
      ) : null}
    </aside>
  );
}
