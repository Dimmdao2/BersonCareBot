import { cn } from "@/lib/utils";

// -- Sections -----------------------------------------------------------------

/** Page-level section container for doctor pages. */
export const doctorSectionCardClass = "rounded-xl border border-border bg-card p-3 flex flex-col gap-3";

/** Inner list row/card inside page-level sections. */
export const doctorSectionItemClass = "rounded-lg border border-border/70 bg-background/40 p-3 text-sm";

/** Semantic tone for urgent row/card state. */
export const doctorSectionItemUrgentClass = "border-destructive/40 bg-destructive/5";

/** Semantic tone for neutral row/card state. */
export const doctorSectionItemNeutralClass = "border-border bg-muted/15";

export function getDoctorSectionItemClass(tone: "default" | "urgent" | "neutral" = "default"): string {
  if (tone === "urgent") return cn(doctorSectionItemClass, doctorSectionItemUrgentClass);
  if (tone === "neutral") return cn(doctorSectionItemClass, doctorSectionItemNeutralClass);
  return doctorSectionItemClass;
}

// -- Lists --------------------------------------------------------------------

/** Outer shell for standalone list item cards. */
export const doctorListItemOuterClass = "rounded-lg border border-border bg-card p-0";

/** Shared row class for catalog master lists. */
export const doctorCatalogRowClass =
  "flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:bg-muted";

/** Active row class for catalog master lists. */
export const doctorCatalogRowActiveClass =
  "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25";

/** Empty state copy in catalog master list (list mode). */
export const doctorCatalogListEmptyClass = "px-2 pb-2 text-sm text-muted-foreground";

/** Empty state copy in catalog tile grid. */
export const doctorCatalogListEmptyTilesClass = "px-2 text-sm text-muted-foreground";

/** Standalone catalog editor page shell (new / [id] routes outside split-layout). */
export const doctorCatalogEditorSectionClass =
  "flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm";

/** Compact history/event row inside panels. */
export const doctorHistoryRowClass = "rounded-md border border-border/60 bg-muted/10 px-2 py-1.5";

// -- Typography ---------------------------------------------------------------

/** Page title (h1 in AppShell content or standalone page headers). */
export const doctorPageTitleClass = "text-base font-semibold tracking-tight text-foreground";

/** Section title for h2/h3 in doctor pages. */
export const doctorSectionTitleClass = "text-sm font-semibold text-foreground";

/** KPI numeric value on compact stat cards (dashboard, analytics). */
export const doctorMetricValueClass = "text-xl font-semibold tabular-nums leading-tight text-foreground";

/** KPI stat card label (uppercase, compact). */
export const doctorMetricLabelClass =
  "text-[10px] font-medium uppercase leading-snug tracking-wide text-muted-foreground line-clamp-3";

/** Shell for KPI stat cards (`DoctorStatCard`). */
export const doctorStatCardShellClass = "rounded-lg border border-border/60 bg-card p-2.5 min-w-0";

export const doctorStatCardShellWarningClass =
  "rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 min-w-0";

/** Section subtitle and helper text under headings. */
export const doctorSectionSubtitleClass = "text-xs text-muted-foreground";

/** Inline action link used inside text flow. */
export const doctorInlineLinkClass = "text-primary underline underline-offset-2";

/** Secondary hover-link style used for optional actions. */
export const doctorHoverLinkClass = "text-primary underline-offset-4 hover:underline font-medium";

// -- Empty states -------------------------------------------------------------

/** Default container for empty states in doctor pages. */
export const doctorEmptyStateClass = "flex flex-col gap-2 text-sm text-muted-foreground";

// -- Grids --------------------------------------------------------------------

/** KPI cards grid (dashboard/analytics): 3 per row on mobile, denser on wide screens. */
export const doctorStatCardGridClass =
  "grid grid-cols-3 gap-2 md:gap-2.5 xl:grid-cols-4 2xl:grid-cols-5";

/** Media card grid (doctor content library). */
export const doctorMediaCardGridClass = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

// -- Simple layout helpers ----------------------------------------------------

/** Typical vertical stack for doctor page content. */
export const doctorPageStackClass = "flex flex-col gap-3";

/** Header stack in doctor page-level sections. */
export const doctorSectionHeaderStackClass = "flex flex-col gap-0.5";
