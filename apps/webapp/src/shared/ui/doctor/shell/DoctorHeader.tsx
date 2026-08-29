'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/ui/doctor/primitives/sheet';
import { cn } from '@/lib/utils';
import { DoctorMenuAccordion } from '@/shared/ui/doctor/shell/DoctorMenuAccordion';
import { DOCTOR_MENU_ITEM_RADIUS_CLASS, NAV_STRIP_ICON_STROKE } from '@/shared/ui/doctor/navChrome';
import { DOCTOR_HEADER_INNER_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { getDoctorScreenTitle } from '@/shared/ui/doctorScreenTitles';
import { doctorPageTitleClass } from '@/shared/ui/doctor/doctorVisual';
import type { DoctorMenuAccess } from '@/shared/ui/doctor/doctorNavLinks';
import { useDoctorShellChrome } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { routePaths } from '@/app-layer/routes/paths';

type DoctorHeaderProps = {
  userDisplayName?: string;
  isPlatformOperator?: boolean;
  menuAccess: DoctorMenuAccess;
  /** Если `"клиент"`, пункт «Пациенты» в Sheet-меню отображается как «Клиенты» (как в сайдбаре). */
  patientLabel?: string;
  /** Когда true (админ + левый сайдбар в layout), кнопка «Меню» скрыта на md+. */
  hideMenuOnDesktop?: boolean;
  enableBadgePolling?: boolean;
  /** Which item source `DoctorMenuAccordion` renders. See `DoctorMenuAccordionProps.menuKind`. */
  menuKind?: 'doctor' | 'platform';
};

/** Touch target ≥ 44px; базовый `icon` = 32px — переопределение. */
const HEADER_ICON_CLASS = cn(
  buttonVariants({ variant: 'ghost', size: 'icon' }),
  'size-10 shrink-0',
);

export function DoctorHeader({
  userDisplayName,
  isPlatformOperator,
  menuAccess,
  patientLabel,
  hideMenuOnDesktop,
  enableBadgePolling,
  menuKind = 'doctor',
}: DoctorHeaderProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/app/doctor';
  const shellChrome = useDoctorShellChrome();
  const title = shellChrome?.title ?? getDoctorScreenTitle(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const backHref = shellChrome?.backHref;
  const showBack = Boolean(backHref);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const goBack = useCallback(() => {
    if (backHref) router.push(backHref);
  }, [backHref, router]);

  return (
    <>
      <header
        id="doctor-header"
        className={cn(
          // Глобальная шапка — только мобильный (<md). На desktop кабинет = сайдбар + контент
          // с per-page шапкой (`DoctorPageHeader`), глобальной шапки нет.
          'relative z-50 shrink-0 border-b border-border/70 shadow-sm backdrop-blur-sm supports-backdrop-filter:bg-background/80 md:hidden',
          isPlatformOperator ? 'bg-destructive/10' : 'bg-background/95',
        )}
      >
        <div className={DOCTOR_HEADER_INNER_CLASS}>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {showBack ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={HEADER_ICON_CLASS}
                aria-label={shellChrome?.backLabel ?? 'Назад'}
                onClick={goBack}
              >
                <ArrowLeft
                  className="size-[22px]"
                  strokeWidth={NAV_STRIP_ICON_STROKE}
                  aria-hidden
                />
              </Button>
            ) : null}
            <p className={cn(doctorPageTitleClass, 'min-w-0 truncate text-left')} title={title}>
              {title}
            </p>
            {isPlatformOperator ? (
              <span className="shrink-0 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive-foreground">
                ADMIN MODE
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center">
            {shellChrome?.mobileActions}
            <Button
              type="button"
              id="doctor-menu-toggle"
              variant="ghost"
              size="icon"
              className={cn(HEADER_ICON_CLASS, hideMenuOnDesktop && 'md:hidden')}
              aria-label="Меню"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-[22px]" strokeWidth={NAV_STRIP_ICON_STROKE} aria-hidden />
            </Button>
          </div>
        </div>
        {userDisplayName ? <p className="sr-only">Пользователь: {userDisplayName}</p> : null}
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="right"
          className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-[22rem] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[env(safe-area-inset-bottom,0px)] pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
            <SheetHeader className="shrink-0 border-0 px-0 py-2 text-left">
              <SheetTitle>Разделы</SheetTitle>
            </SheetHeader>
            <nav
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-y-contain py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
              aria-label="Разделы кабинета"
            >
              <DoctorMenuAccordion
                variant="sheet"
                pathname={pathname}
                menuAccess={menuAccess}
                patientLabel={patientLabel}
                onNavigate={closeMenu}
                enableBadgePolling={enableBadgePolling}
                menuKind={menuKind}
              />
            </nav>
            <div className="shrink-0 border-t border-border/70 py-2">
              <Link
                href={routePaths.account}
                className={cn(
                  DOCTOR_MENU_ITEM_RADIUS_CLASS,
                  'flex min-h-10 items-center px-3 py-2 text-sm font-normal text-foreground no-underline hover:bg-muted/60',
                )}
                onClick={closeMenu}
              >
                {userDisplayName?.trim() || 'Профиль'}
              </Link>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
