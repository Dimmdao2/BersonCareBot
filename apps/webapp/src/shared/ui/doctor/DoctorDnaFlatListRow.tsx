/**
 * Flat list-row vocabulary for the Therapysto Doctor Design DNA.
 *
 * Rows deliberately carry no card chrome or selected fill: hierarchy and selection
 * come from a warm hairline divider, text weight, and the 3px primary marker.
 */

/**
 * The divider lives here on the `<ul>`, not on the row itself: `doctorDnaFlatListRowClass`
 * is applied inconsistently across callers — sometimes directly on the `<li>` (TeamSection),
 * sometimes on an inner `<Link>`/`<Button>` that is itself always the first child of its `<li>`
 * (PatientsPageClient, DoctorSupportInbox, DoctorTodayDashboard). A `first:` self-check on the
 * row class breaks in that second shape (it always matches, since the row element is always its
 * parent `<li>`'s first child), silently deleting every divider. Targeting `> li + li` from the
 * list wrapper instead only cares about `<li>` sibling order, so it works for both shapes.
 */
export const doctorDnaFlatListClass =
  'm-0 list-none p-0 [&>li+li]:border-t [&>li+li]:border-t-[var(--doctor-flat-list-divider,#f0efeb)]';

/**
 * Adds the same outer inset that a flat list gets inside a padded DoctorSection.
 * Use it only when the list sits directly against an unpadded master-pane edge.
 */
export const doctorDnaFlatListInsetClass = 'mx-[var(--doctor-block-padding,18px)]';

export const doctorDnaFlatListRowClass =
  'relative flex items-center gap-3 border-x-0 border-b-0 border-t-0 px-[var(--doctor-list-inline-padding,18px)] py-2.5 text-base font-normal';

export const doctorDnaFlatListClickableClass =
  'cursor-pointer no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';

export const doctorDnaFlatListPrimaryClass = 'text-base font-normal text-foreground';

export const doctorDnaFlatListSelectedPrimaryClass = 'font-semibold text-primary';

export const doctorDnaFlatListMetaClass = 'text-xs text-muted-foreground';

/** 3px flush-left selection marker from DNA v1.0 §6 `.li.sel`. */
export function DoctorDnaFlatListSelectionStrip() {
  return <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />;
}
