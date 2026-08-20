export type CanonicalWriteResponse<TCanonicalWrite> = {
  ok: boolean;
  canonicalWrite?: TCanonicalWrite;
};

export type CanonicalWriteHandoffFailure =
  'transport_error' | 'missing_canonical_write' | 'rejected_canonical_write';

/**
 * Executes the webapp-owned write when the optional canonical acknowledgement is present.
 * Older webapp responses without the field retain the legacy integrator write byte-for-byte.
 */
export async function executeCanonicalWriteOrLegacy<TCanonicalWrite>(input: {
  sync: (() => Promise<CanonicalWriteResponse<TCanonicalWrite>>) | undefined;
  accepts: (canonicalWrite: TCanonicalWrite) => boolean;
  legacyWrite: () => Promise<void>;
  onHandoffFailure?: (failure: CanonicalWriteHandoffFailure) => Promise<void>;
}): Promise<boolean> {
  if (input.sync) {
    try {
      const result = await input.sync();
      if (result.ok && result.canonicalWrite) {
        if (input.accepts(result.canonicalWrite)) {
          return true;
        }
        await input.onHandoffFailure?.('rejected_canonical_write');
        return false;
      }
    } catch {
      await input.onHandoffFailure?.('transport_error');
      await input.legacyWrite();
      return false;
    }
    await input.onHandoffFailure?.('missing_canonical_write');
  }
  await input.legacyWrite();
  return false;
}
