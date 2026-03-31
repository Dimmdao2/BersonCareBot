/** Half-open ranges [start, end): overlap iff aStart < bEnd && aEnd > bStart */
export function intervalsOverlap(
  slotStartA: string,
  slotEndA: string,
  slotStartB: string,
  slotEndB: string,
): boolean {
  const a0 = new Date(slotStartA).getTime();
  const a1 = new Date(slotEndA).getTime();
  const b0 = new Date(slotStartB).getTime();
  const b1 = new Date(slotEndB).getTime();
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  return a0 < b1 && a1 > b0;
}
