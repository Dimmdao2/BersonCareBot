import { cn } from '@/lib/utils';

// -- Sections -----------------------------------------------------------------

/** Page-level section container for doctor pages. */
export const doctorSectionCardClass =
  'rounded-[var(--doctor-page-block-radius,12px)] border border-[var(--doctor-block-border)] bg-card p-[var(--doctor-block-padding,18px)] flex flex-col gap-3';

/** Inner list row/card inside page-level sections. */
export const doctorSectionItemClass =
  'rounded-lg border border-border/70 bg-background/40 p-3 text-base leading-6 md:text-sm md:leading-5';

/** Reset for Button used as an invisible card/list/tile surface. */
export const doctorInteractiveSurfaceButtonClass =
  'h-auto shrink whitespace-normal border-0 bg-transparent p-0 font-normal text-inherit shadow-none hover:bg-transparent hover:text-inherit active:bg-transparent active:text-inherit active:shadow-none aria-expanded:bg-transparent aria-expanded:text-inherit focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Semantic tone for urgent row/card state. */
export const doctorSectionItemUrgentClass = 'border-destructive/40 bg-destructive/5';

/** Semantic tone for neutral row/card state. */
export const doctorSectionItemNeutralClass = 'border-border bg-muted/15';

export function getDoctorSectionItemClass(
  tone: 'default' | 'urgent' | 'neutral' = 'default',
): string {
  if (tone === 'urgent') return cn(doctorSectionItemClass, doctorSectionItemUrgentClass);
  if (tone === 'neutral') return cn(doctorSectionItemClass, doctorSectionItemNeutralClass);
  return doctorSectionItemClass;
}

// -- Lists --------------------------------------------------------------------

/** Outer shell for standalone list item cards. */
export const doctorListItemOuterClass = 'rounded-lg border border-border bg-card p-0';

/** Shared row class for catalog master lists. */
export const doctorCatalogRowClass =
  'flex w-full items-center gap-2 border-b border-border px-[var(--doctor-list-inline-padding,18px)] py-2.5 text-left text-base font-normal hover:bg-muted last:border-b-0';

/** Active row class for catalog master lists. */
export const doctorCatalogRowActiveClass =
  'border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25';

/** Empty state copy in catalog master list (list mode). */
export const doctorCatalogListEmptyClass =
  'px-2 pb-2 text-base leading-6 text-muted-foreground md:text-sm md:leading-5';

/** Empty state copy in catalog tile grid. */
export const doctorCatalogListEmptyTilesClass =
  'px-2 text-base leading-6 text-muted-foreground md:text-sm md:leading-5';

/** Standalone catalog editor page shell (new / [id] routes outside split-layout). */
export const doctorCatalogEditorSectionClass =
  'flex flex-col gap-3 rounded-[var(--doctor-page-block-radius,12px)] border border-border bg-card p-[var(--doctor-block-padding,18px)] shadow-sm';

/** Compact history/event row inside panels. */
export const doctorHistoryRowClass = 'rounded-md border border-border/60 bg-muted/10 px-2 py-1.5';

// -- Typography ---------------------------------------------------------------

/** Page title (h1 in AppShell content or standalone page headers). */
export const doctorPageTitleClass = 'text-[18px] font-medium tracking-tight text-foreground';

/** Title in the shared doctor modal header. */
export const doctorModalTitleClass = 'text-base font-medium tracking-tight text-foreground';

/** Entity name composed into a doctor modal header; visually equal to the modal title. */
export const doctorModalEntityTitleClass = doctorModalTitleClass;

/** Section title for h2/h3 in doctor pages. */
export const doctorSectionTitleClass =
  'text-base leading-6 font-semibold text-foreground md:text-sm md:leading-5';

/** Default body copy in doctor pages. */
export const doctorBodyTextClass = 'text-base leading-6 text-foreground md:text-sm md:leading-5';

/** Message copy inside doctor chat bubbles. */
export const doctorChatMessageTextClass = 'text-[15px] leading-[22px] text-foreground';

/** Timestamp placed beside a doctor chat bubble. */
export const doctorChatTimestampClass =
  'shrink-0 pb-0.5 text-xs leading-4 tabular-nums text-muted-foreground/70';

/** Primary entity/title line in doctor lists. */
export const doctorPrimaryListTextClass = 'text-base font-normal text-foreground';

/** Secondary content line in doctor lists (message/comment preview). */
export const doctorSecondaryListTextClass = 'text-sm font-normal text-foreground/80';

/** Two-line body preview used for messages and comments in attention lists. */
export const doctorListPreviewTextClass =
  'mt-0.5 line-clamp-2 whitespace-normal break-words text-sm leading-5 font-normal text-foreground [overflow-wrap:anywhere]';

/** Secondary labels, timestamps, hints, and metadata. */
export const doctorMetaTextClass =
  'text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4';

/**
 * Вторая строка шапки модалки доктора (контекст: «Пациент: Фамилия Имя» / «Клиент: Фамилия Имя»).
 * Меньше основного `doctorModalTitleClass`, но плотнее обычной заметки специалиста (`text-sm`).
 */
export const doctorModalTitleSubjectClass = cn(doctorMetaTextClass, 'font-medium');

/** Плотная сводка над прокручиваемым телом модалки (счётчики и короткие подписи). */
export const doctorModalSummaryTextClass = cn(doctorMetaTextClass, 'font-medium text-foreground');

/**
 * Одна лёгкая нижняя тень под закреплённой панелью, которая держит верх прокручиваемого тела.
 * Зеркало верхней тени шеллов (`DoctorBottomNav` / `DoctorMobileSectionTabs`).
 */
export const doctorPanelBottomShadowClass = 'shadow-[0_2px_6px_rgba(15,23,42,0.08)]';

/** KPI numeric value on compact stat cards (dashboard, analytics). */
export const doctorMetricValueClass =
  'text-[18px] font-semibold tabular-nums leading-tight text-foreground';

/** Inline/secondary numeric value that belongs in a text row rather than a full KPI. */
export const doctorInlineMetricValueClass = 'text-base font-semibold tabular-nums leading-none';

/** KPI stat card label (uppercase, compact). */
export const doctorMetricLabelClass =
  'text-xs font-medium uppercase leading-snug tracking-wide text-foreground/85 line-clamp-3';

/** Shared inner spacing for KPI content. */
export const doctorStatCardContentPaddingClass = 'py-2.5 pr-4 pl-2.5 md:p-2.5';

/** Shell for KPI stat cards (`DoctorStatCard`). */
export const doctorStatCardShellClass = cn(
  'min-w-0 rounded-[var(--doctor-kpi-radius,8px)] border border-border/60 bg-card',
  doctorStatCardContentPaddingClass,
);

export const doctorStatCardShellWarningClass = cn(
  'min-w-0 rounded-[var(--doctor-kpi-radius,8px)] border border-destructive/40 bg-destructive/5',
  doctorStatCardContentPaddingClass,
);

/** Whole-card click/hover for KPI stat cards (analytics, today). */
export const doctorStatCardInteractiveClass =
  'cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/** A subtle affordance for neutral KPI cards that open a destination or modal. */
export const doctorStatCardInteractiveNeutralClass = 'border-primary/35';

/** Attached action segment on the right edge of an actionable KPI card. */
export const doctorStatCardActionSegmentClass =
  'h-full min-w-11 rounded-l-none rounded-r-[var(--doctor-kpi-radius,8px)] border border-primary/30 bg-primary/5 px-3 text-primary hover:bg-primary/15';

/** Section subtitle and helper text under headings. */
export const doctorSectionSubtitleClass = doctorMetaTextClass;

/** Inline action link used inside text flow. */
export const doctorInlineLinkClass = 'text-primary underline underline-offset-2';

/** Secondary hover-link style used for optional actions. */
export const doctorHoverLinkClass = 'text-primary underline-offset-4 hover:underline font-medium';

// -- Empty states -------------------------------------------------------------

/** Default container for empty states in doctor pages. */
export const doctorEmptyStateClass =
  'flex flex-col gap-2 text-base leading-6 text-muted-foreground md:text-sm md:leading-5';

/** Compact empty-state variant for dense panels / inline hints inside cards. */
export const doctorEmptyStateCompactClass = 'flex flex-col gap-2 text-xs text-muted-foreground';

// -- Grids --------------------------------------------------------------------

/** KPI cards grid (dashboard/analytics): 3 per row on mobile, denser on wide screens. */
export const doctorStatCardGridClass =
  'grid grid-cols-3 gap-2 md:gap-2.5 xl:grid-cols-4 2xl:grid-cols-5';

/** Media card grid (doctor content library). */
export const doctorMediaCardGridClass = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

// -- Simple layout helpers ----------------------------------------------------

/** Typical vertical stack for doctor page content. */
export const doctorPageStackClass = 'flex flex-col gap-3';

/** Header stack in doctor page-level sections. */
export const doctorSectionHeaderStackClass = 'flex flex-col gap-0.5';
