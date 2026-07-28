import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTotpUri, verifyTotpCode } from './totp';

describe('staff TOTP primitives', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts the RFC 6238 SHA-1 vector truncated to six digits', () => {
    // RFC 6238 Appendix B published SHA-1 test vector, not a secret.
    // nosemgrep: generic.secrets.security.detected-generic-secret.detected-generic-secret
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(verifyTotpCode(secret, '287082', 59_000)).toBe(true);
    expect(verifyTotpCode(secret, '287083', 59_000)).toBe(false);
  });

  it('encodes the account label', () => {
    expect(buildTotpUri({ secret: 'ABC', email: 'owner+clinic@example.test' })).toContain(
      'BersonCare%3Aowner%2Bclinic%40example.test',
    );
  });
});
