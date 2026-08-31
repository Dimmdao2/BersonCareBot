'use client';

import { cn } from '@/lib/utils';

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
}: {
  tabs: readonly DoctorMobileSectionTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="relative z-40 shrink-0 border-t border-border/70 bg-background/95 shadow-[0_-2px_6px_rgba(15,23,42,0.08)] backdrop-blur-md md:hidden"
    >
      <div className="flex h-11">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                active && 'bg-primary/10 text-primary',
              )}
            >
              <span className="truncate">{tab.label}</span>
              {tab.badge && tab.badge > 0 ? (
                <span
                  className={cn(
                    'inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none tabular-nums',
                    active ? 'bg-primary/15 text-primary' : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
