'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarPlus, ChartLine, Dumbbell, Home, MessageCircle } from 'lucide-react';
import {
  getPatientPrimaryNavActiveId,
  PATIENT_PRIMARY_NAV_ITEMS,
  type PatientPrimaryNavItem,
  type PatientPrimaryNavItemId,
} from '@/app-layer/routes/navigation';
import { cn } from '@/lib/utils';
import { usePatientSupportUnreadCount } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import { NAV_STRIP_ICON_STROKE } from '@/shared/ui/patient/navChrome';
import { PatientNavCountBadge } from '@/shared/ui/patient/PatientNavCountBadge';
import {
  usePatientOrganizationContext,
  usePatientTerms,
} from '@/shared/ui/patient/organization/PatientOrganizationContext';

const NAV_ICONS: Record<PatientPrimaryNavItemId, typeof Home> = {
  today: Home,
  booking: CalendarPlus,
  diary: ChartLine,
  plan: Dumbbell,
  messages: MessageCircle,
};

function navLinkAriaLabel(label: string, chatUnread: number, isMessages: boolean): string {
  if (isMessages && chatUnread > 0) return `${label}, ${chatUnread} новых`;
  return label;
}

type Props = {
  className?: string;
  /** Компактные подписи (нижняя полоска mobile). */
  variant?: 'bottom' | 'inline';
};

/** Primary nav: вкладки «Сегодня / Упражнения / … / Чат». */
export function PatientPrimaryNavStrip({ className, variant = 'bottom' }: Props) {
  const pathname = usePathname() ?? '';
  const activeId = getPatientPrimaryNavActiveId(pathname);
  const organizationContext = usePatientOrganizationContext();
  const { patientGenitive } = usePatientTerms();
  const directChatEnabled = organizationContext?.workspaceModules?.direct_chat !== false;
  const chatUnread = usePatientSupportUnreadCount(directChatEnabled);
  const navItems = PATIENT_PRIMARY_NAV_ITEMS.filter(
    (item) =>
      (item.id !== 'plan' || organizationContext?.workspaceModules?.rehabilitation !== false) &&
      (item.id !== 'messages' || directChatEnabled),
  );

  const renderNavLink = (item: PatientPrimaryNavItem) => {
    const Icon = NAV_ICONS[item.id];
    const isActive = activeId === item.id;
    const showChatBadge = item.id === 'messages' && chatUnread > 0;
    const ariaLabel = navLinkAriaLabel(item.label, chatUnread, item.id === 'messages');

    if (variant === 'inline') {
      return (
        <Link
          key={item.id}
          href={item.href}
          prefetch={false}
          aria-label={ariaLabel}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 patient-type-navigation',
            isActive
              ? 'bg-[var(--patient-color-primary-soft)]/50 patient-text-navigation-active'
              : 'patient-text-navigation-inactive',
          )}
        >
          <span className="relative inline-flex shrink-0">
            <Icon
              className="size-[18px] shrink-0"
              strokeWidth={NAV_STRIP_ICON_STROKE}
              aria-hidden
            />
            {showChatBadge ? <PatientNavCountBadge count={chatUnread} /> : null}
          </span>
          <span className="truncate">{item.label}</span>
        </Link>
      );
    }

    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={false}
        aria-label={ariaLabel}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'group flex min-h-0 min-w-0 w-full flex-col items-center justify-center gap-0.5 px-0.5 py-1',
          isActive
            ? 'patient-text-navigation-active'
            : 'patient-text-navigation-inactive',
        )}
      >
        <span className="relative inline-flex shrink-0">
          <Icon
            className={cn(
              'size-5 shrink-0 transition-colors duration-200 ease-out',
              isActive
                ? 'size-[22px] patient-text-navigation-active'
                : 'patient-text-navigation-inactive patient-text-navigation-group-inactive',
            )}
            strokeWidth={NAV_STRIP_ICON_STROKE}
            aria-hidden
          />
          {showChatBadge ? <PatientNavCountBadge count={chatUnread} /> : null}
        </span>
        <span className="w-full truncate text-center patient-type-caption">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label={`Основная навигация ${patientGenitive}`}
      data-nav-count={navItems.length}
      className={cn(
        variant === 'bottom'
          ? 'patient-shell-bottom-nav-grid mx-auto max-w-[26.5rem]'
          : 'flex w-full min-w-0 items-stretch justify-center gap-1',
        className,
      )}
    >
      {navItems.map(renderNavLink)}
    </nav>
  );
}
