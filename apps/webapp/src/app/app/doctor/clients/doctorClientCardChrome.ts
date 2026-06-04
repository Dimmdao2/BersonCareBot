/** Общие классы карточки клиента врача (2B), без одноразового chrome в каждом табе. */

// -- Entity card shell (§9) ----------------------------------------------------

/** Outer article shell for ClientProfileCard. */
export const doctorClientProfileCardClass = "rounded-lg border border-border bg-card shadow-sm";

/** Sticky wrapper for care bar + optional action strip. */
export const doctorClientProfileStickyShellClass =
  "md:sticky md:top-[var(--doctor-sticky-offset,0px)] md:z-10";

/** PatientCareBar header (§9a). */
export const doctorClientEntityHeaderClass = "border-b border-border bg-card px-4 py-3";

export const doctorClientDisplayNameClass = "min-w-0 text-base font-semibold text-foreground";

export const doctorClientStatusPillMutedClass =
  "rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground";

export const doctorClientStatusPillDestructiveClass =
  "rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive";

/** Quick-action chips strip (§9b); render only when chips.length > 0. */
export const doctorClientActionStripClass = "border-b border-border bg-card px-2 py-1.5";

export const doctorClientActionStripChipsClass = "flex flex-wrap gap-1.5";

/** Extra classes on chip buttons (with buttonVariants size sm). */
export const doctorClientActionChipClass = "h-7 px-2.5 text-xs";

/** Tabs scroll row (§9c). */
export const doctorClientTabsScrollClass = "overflow-x-auto border-b border-border bg-card px-2";

export const doctorClientTabsListClass =
  "h-auto w-max min-w-full justify-start gap-0 bg-transparent p-0";

export const doctorClientTabTriggerClass = "rounded-none px-3 py-2";

export const doctorClientTabBadgeClass = "ml-1 h-5 min-w-5 px-1 text-[10px] tabular-nums";

export const doctorClientBackLinkClass =
  "inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted";

export const doctorClientBlockedBannerClass =
  "rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm";

/** Compact client list row link (§5f). */
export const doctorClientListRowLinkClass =
  "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left no-underline transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring";

/** Vertical stack inside tab sections / panels. */
export const doctorClientPanelStackClass = "flex flex-col gap-3";

// -- Overview / tab panels (§9d–§9g) -----------------------------------------

export const doctorClientOverviewPrimaryCardClass =
  "flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm";

export const doctorClientOverviewSecondaryCardClass =
  "flex h-full min-h-0 flex-col rounded-lg border border-border/80 bg-muted/15 p-4";

export const doctorClientSectionTitleClass = "text-sm font-semibold text-foreground";

export const doctorClientTabSectionClass = "border-b border-border px-4 py-4 last:border-b-0";

export const doctorClientUrgentZoneClass = "rounded-xl border border-border bg-card p-4 shadow-sm";

export const doctorClientInsetListRowClass =
  "flex items-center gap-3 rounded-lg border border-border bg-muted/15 p-2.5 transition-colors hover:bg-muted/40";

export const doctorClientStackedCardClass = "rounded-lg border border-border bg-card p-3 shadow-sm";

/** Two-column overview grid inside client card (§9e). */
export const doctorClientOverviewGridClass = "grid gap-4 p-4 md:grid-cols-2";

/** @deprecated Используйте primary/secondary overview классы. */
export const doctorClientOverviewCardClass = doctorClientOverviewPrimaryCardClass;
