import { cn } from '@/lib/utils';
import {
  patientActionTextClass,
  patientHeroBookingSectionClass,
} from '@/shared/ui/patient/patientVisual';

/** Обёртка блока выбора (город/онлайн, услуги): см. {@link patientHeroBookingSectionClass}. */
export const bookingChoiceSectionClass = patientHeroBookingSectionClass;

/** Ряд выбора: белый фон, синий hover/active по всей площади; без иконок — только класс строки. */
export const bookingChoiceRowClass = cn(
  'group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border border-[var(--patient-border)] bg-white px-3 py-3',
  patientActionTextClass,
  'transition-colors',
  'patient-text-interactive-inverse hover:border-[var(--patient-color-primary)] hover:bg-[var(--patient-color-primary)]',
  'active:border-[var(--patient-color-primary)] active:bg-[var(--patient-color-primary)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
);

/** Иконки слева в рядах «город / онлайн». */
export const bookingChoiceRowIconClass =
  'size-5 shrink-0 patient-text-secondary patient-text-secondary-group-hover-inverse transition-colors';
