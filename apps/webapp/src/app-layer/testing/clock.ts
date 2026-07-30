export type TestClock = Readonly<{
  now: () => Date;
  nowMilliseconds: () => number;
  nowSeconds: () => number;
}>;

/** A deterministic clock for contracts; it never changes global timers. */
export function fixedClock(at: Date | number): TestClock {
  const milliseconds = at instanceof Date ? at.getTime() : at;
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError('A fixed test clock requires a finite timestamp.');
  }

  return Object.freeze({
    now: () => new Date(milliseconds),
    nowMilliseconds: () => milliseconds,
    nowSeconds: () => Math.floor(milliseconds / 1_000),
  });
}
