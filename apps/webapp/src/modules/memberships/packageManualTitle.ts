/** Auto-title for individual patient packages when doctor does not provide a name. */
export function buildManualPatientPackageTitle(params: {
  itemCount: number;
  soldAtIso?: string | null;
  now?: Date;
}): string {
  const n = params.itemCount;
  const posLabel = n === 1 ? "позиция" : n >= 2 && n <= 4 ? "позиции" : "позиций";
  const dateSource = params.soldAtIso ? new Date(params.soldAtIso) : (params.now ?? new Date());
  const dd = String(dateSource.getUTCDate()).padStart(2, "0");
  const mm = String(dateSource.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = dateSource.getUTCFullYear();
  return `Индивидуальный · ${n} ${posLabel} · ${dd}.${mm}.${yyyy}`;
}
