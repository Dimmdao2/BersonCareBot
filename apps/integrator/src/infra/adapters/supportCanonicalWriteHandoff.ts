export type CanonicalWriteResponse<TCanonicalWrite> = {
  ok: boolean;
  canonicalWrite?: TCanonicalWrite;
};

/**
 * Executes the webapp-owned write when the optional canonical acknowledgement is present.
 * Older webapp responses without the field retain the legacy integrator write byte-for-byte.
 */
export async function executeCanonicalWriteOrLegacy<TCanonicalWrite>(input: {
  sync: (() => Promise<CanonicalWriteResponse<TCanonicalWrite>>) | undefined;
  accepts: (canonicalWrite: TCanonicalWrite) => boolean;
  legacyWrite: () => Promise<void>;
}): Promise<boolean> {
  if (input.sync) {
    try {
      const result = await input.sync();
      if (result.ok && result.canonicalWrite && input.accepts(result.canonicalWrite)) {
        return true;
      }
    } catch {
      // Compatibility is deliberate: transport failure follows the pre-D4 local canonical path.
    }
  }
  await input.legacyWrite();
  return false;
}
