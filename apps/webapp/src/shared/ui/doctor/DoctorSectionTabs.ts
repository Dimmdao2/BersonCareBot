import { cn } from '@/lib/utils';

/** Shared visual contract for top-level tabs inside doctor page headers/toolbars. */
export const doctorSectionTabBaseClass =
  'inline-flex shrink-0 items-center gap-1.5 !rounded-[var(--button-radius,8px)] px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors';

export const doctorSectionTabActiveClass = 'bg-primary text-primary-foreground';

export const doctorSectionTabInactiveClass =
  'text-muted-foreground hover:bg-[var(--doctor-section-tab-hover)] hover:text-foreground';

export function doctorSectionTabClass(active: boolean): string {
  return cn(
    doctorSectionTabBaseClass,
    active ? doctorSectionTabActiveClass : doctorSectionTabInactiveClass,
  );
}
