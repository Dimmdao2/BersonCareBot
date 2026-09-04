'use client';

import { cn } from '@/lib/utils';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';

export type DoctorMobileSectionTab<T extends string> = {
  id: T;
  label: string;
  badge?: number;
};

export function DoctorMobileSectionTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel,
  scrollable = false,
  elevated = true,
}: {
  tabs: readonly DoctorMobileSectionTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  ariaLabel: string;
  /** Use the canonical mobile tabs as a horizontally scrollable subsection row. */
  scrollable?: boolean;
  /** Controls the subtle separator shadow above this docked navigation level. */
  elevated?: boolean;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'relative z-40 shrink-0 border-t border-border/70 bg-background/95 backdrop-blur-md md:hidden',
        elevated && 'shadow-[0_-2px_6px_rgba(15,23,42,0.08)]',
      )}
    >
      <div
        className={cn(
          'flex h-11',
          scrollable && 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex min-w-0 items-center justify-center gap-1.5 px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                scrollable ? 'shrink-0 whitespace-nowrap' : 'flex-auto',
                active && 'bg-primary/10 text-primary',
              )}
            >
              <span className="truncate">{tab.label}</span>
              <DoctorAttentionBadge count={tab.badge} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
