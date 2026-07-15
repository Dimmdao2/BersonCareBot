import { describe, expect, it } from 'vitest';
import { isDevAuthBypassEnabled } from './devBypassPolicy';

describe('isDevAuthBypassEnabled', () => {
  it('allows bypass only in development with the explicit flag', () => {
    expect(isDevAuthBypassEnabled({ nodeEnv: 'development', allowDevAuthBypass: true })).toBe(true);
    expect(isDevAuthBypassEnabled({ nodeEnv: 'development', allowDevAuthBypass: false })).toBe(
      false,
    );
    expect(isDevAuthBypassEnabled({ nodeEnv: 'test', allowDevAuthBypass: true })).toBe(false);
    expect(isDevAuthBypassEnabled({ nodeEnv: 'production', allowDevAuthBypass: true })).toBe(false);
  });
});
