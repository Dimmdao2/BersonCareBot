import { describe, expect, it } from 'vitest';
import { resolveSkipBindPhoneSurface } from './resolveSkipBindPhoneSurface';

describe('resolveSkipBindPhoneSurface', () => {
  it('keeps the explicit profile replacement flow visible for a patient with a trusted phone', () => {
    expect(
      resolveSkipBindPhoneSurface({
        databaseUrlSet: true,
        phoneTrustedForPatient: true,
        sessionSnapshotHasPhone: true,
        explicitReplacement: true,
      }),
    ).toBe(false);
  });

  it('still skips ordinary bind gates when the phone is already trusted', () => {
    expect(
      resolveSkipBindPhoneSurface({
        databaseUrlSet: true,
        phoneTrustedForPatient: true,
        sessionSnapshotHasPhone: true,
      }),
    ).toBe(true);
  });
});
