'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { routePaths } from '@/app-layer/routes/paths';
import { cn } from '@/lib/utils';
import { DoctorMenuAccordion } from '@/shared/ui/doctor/shell/DoctorMenuAccordion';
import {
  DoctorSidebarRowContent,
  doctorSidebarRowClassName,
} from '@/shared/ui/doctor/shell/DoctorSidebarRowContent';
import { NAV_STRIP_ICON_STROKE } from '@/shared/ui/doctor/navChrome';
import {
  DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS,
  DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import type { DoctorMenuAccess } from '@/shared/ui/doctor/doctorNavLinks';
import { STAFF_SURFACE_NAME } from '@/config/productSurfaceNames';

type DoctorAdminSidebarProps = {
  userDisplayName?: string;
  menuAccess: DoctorMenuAccess;
  /** Если `"клиент"`, пункт «Пациенты» отображается как «Клиенты». */
  patientLabel?: string;
  enableBadgePolling?: boolean;
  homeHref?: string;
  /** Server-resolved effective organization brand used by the account entry. */
  brand?: { displayName: string; logoUrl: string | null };
  /** Which item source `DoctorMenuAccordion` renders. */
  menuKind?: 'doctor' | 'platform';
};

/**
 * Общая левая навигация staff-zone:
 * - md–lg: узкий rail; по кнопке раскрывается поверх контента;
 * - lg+: полноценный sidebar рядом с контентом;
 * - <md: скрыта, навигацией владеет мобильный `DoctorHeader`.
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
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const accountDisplayName = brand?.displayName ?? userDisplayName ?? 'Аккаунт';
  const accountInitial = accountDisplayName.trim().charAt(0).toUpperCase() || 'А';
  const accountActive =
    pathname === routePaths.account || pathname.startsWith(`${routePaths.account}/`);

  return (
    <aside
      id="doctor-admin-sidebar"
      className={cn('relative z-40 hidden shrink-0 md:block', DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS)}
      aria-label="Разделы кабинета"
    >
      <div
        className={cn(
          'flex w-14 flex-col border-r border-border/70 bg-background px-2 pb-4 pt-3 transition-[width] duration-200',
          'md:sticky md:h-[100dvh] md:self-start md:overflow-y-auto',
          DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS,
          tabletExpanded && 'md:w-56 md:shadow-xl',
          'lg:w-56 lg:shadow-none',
        )}
      >
        <Link
          href={homeHref}
          prefetch={false}
          id="doctor-sidebar-brand"
          className={doctorSidebarRowClassName(
            tabletExpanded,
            'mb-3 no-underline',
            'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <DoctorSidebarRowContent
            icon={
              <span className="font-semibold" aria-hidden>
                Т
              </span>
            }
            iconVisibility="collapsed-only"
            label={
              <span className="font-semibold tracking-tight text-foreground">
                {STAFF_SURFACE_NAME}
              </span>
            }
            tabletExpanded={tabletExpanded}
          />
        </Link>

        <div className="mb-2">
          <Button
            type="button"
            variant="ghost"
            id="doctor-sidebar-tablet-toggle"
            className={doctorSidebarRowClassName(tabletExpanded, 'hidden md:flex lg:hidden')}
            aria-label={tabletExpanded ? 'Свернуть боковую панель' : 'Развернуть боковую панель'}
            aria-expanded={tabletExpanded}
            onClick={() => setTabletExpanded((expanded) => !expanded)}
          >
            <DoctorSidebarRowContent
              icon={
                tabletExpanded ? (
                  <PanelLeftClose className="size-[18px]" strokeWidth={NAV_STRIP_ICON_STROKE} />
                ) : (
                  <PanelLeftOpen className="size-[18px]" strokeWidth={NAV_STRIP_ICON_STROKE} />
                )
              }
              tabletExpanded={tabletExpanded}
            />
          </Button>
          <p className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:block">
            Разделы
          </p>
        </div>

        <nav
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden"
          aria-label="Разделы кабинета"
        >
          <DoctorMenuAccordion
            variant="sidebar"
            pathname={pathname}
            menuAccess={menuAccess}
            patientLabel={patientLabel}
            onNavigate={() => setTabletExpanded(false)}
            enableBadgePolling={enableBadgePolling}
            menuKind={menuKind}
            tabletExpanded={tabletExpanded}
          />
          <form action="/api/auth/logout" method="post" className="w-full">
            <Button
              type="submit"
              variant="ghost"
              id="doctor-sidebar-logout"
              className={doctorSidebarRowClassName(
                tabletExpanded,
                'text-destructive hover:bg-destructive/10 hover:text-destructive',
              )}
            >
              <DoctorSidebarRowContent
                icon={
                  <LogOut
                    className="size-4"
                    strokeWidth={NAV_STRIP_ICON_STROKE}
                    aria-hidden
                  />
                }
                label="Выйти"
                tabletExpanded={tabletExpanded}
              />
            </Button>
          </form>
        </nav>

        <Link
          href={routePaths.account}
          prefetch={false}
          id="doctor-sidebar-account"
          title={accountDisplayName}
          aria-current={accountActive ? 'page' : undefined}
          onClick={() => setTabletExpanded(false)}
          className={doctorSidebarRowClassName(
            tabletExpanded,
            'mt-3 no-underline transition-colors',
            accountActive
              ? 'bg-primary/15 font-medium text-primary hover:bg-primary/15'
              : 'text-foreground hover:bg-muted/60',
          )}
        >
          <DoctorSidebarRowContent
            icon={
              <span className="inline-flex size-7 items-center justify-center overflow-hidden rounded-full bg-foreground/5 text-xs font-medium text-foreground">
                {brand?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small chrome avatar, server-validated /api/media URL
                  <img src={brand.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden>{accountInitial}</span>
                )}
              </span>
            }
            label={accountDisplayName}
            tabletExpanded={tabletExpanded}
          />
        </Link>
      </div>
    </aside>
  );
}
