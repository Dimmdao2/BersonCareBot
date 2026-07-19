/**
 * Flat list-row vocabulary for the BersonCare Doctor Design DNA.
 *
 * Rows deliberately carry no card chrome or selected fill: hierarchy and selection
 * come from a warm hairline divider, text weight, and the 3px primary marker.
 */

export const doctorDnaFlatListClass = "m-0 list-none p-0";

export const doctorDnaFlatListRowClass =
  "relative flex items-center gap-3 border-t border-border px-3 py-2.5 text-sm";

export const doctorDnaFlatListClickableClass =
  "cursor-pointer no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

export const doctorDnaFlatListPrimaryClass = "text-sm font-medium text-foreground";

export const doctorDnaFlatListSelectedPrimaryClass = "font-semibold text-primary";

export const doctorDnaFlatListMetaClass = "text-xs text-muted-foreground";

/** 3px flush-left selection marker from DNA v1.0 §6 `.li.sel`. */
export function DoctorDnaFlatListSelectionStrip() {
  return <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary" />;
}
