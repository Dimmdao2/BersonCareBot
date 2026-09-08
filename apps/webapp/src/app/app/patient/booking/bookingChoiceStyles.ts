import { cn } from '@/lib/utils';
import {
  patientActionTextClass,
  patientBodyTextClass,
  patientHeroBookingSectionClass,
} from '@/shared/ui/patient/patientVisual';

/** Обёртка блока выбора (город/онлайн, услуги): см. {@link patientHeroBookingSectionClass}. */
export const bookingChoiceSectionClass = patientHeroBookingSectionClass;

/** Ряд выбора: белый фон, синий hover/active по всей площади; без иконок — только класс строки. */
export const bookingChoiceRowClass = cn(
  'group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-[var(--patient-border)] bg-white px-3 py-3',
  patientBodyTextClass,
  patientActionTextClass,
  'transition-colors',
  'hover:border-[var(--patient-color-primary)] hover:bg-[var(--patient-color-primary)] hover:text-primary-foreground',
  'active:border-[var(--patient-color-primary)] active:bg-[var(--patient-color-primary)] active:text-primary-foreground',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
);

/** Иконки слева в рядах «город / онлайн». */
export const bookingChoiceRowIconClass =
  'size-5 shrink-0 patient-text-secondary patient-text-secondary-group-hover-inverse transition-colors';
