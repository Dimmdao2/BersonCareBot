/** Общие классы карточки клиента врача (2B), без одноразового chrome в каждом табе. */
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
