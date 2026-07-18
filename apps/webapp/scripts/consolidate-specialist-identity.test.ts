import { describe, expect, it } from 'vitest';
import { validateExplicitCanonicalCandidate } from './consolidate-specialist-identity';

const ORG_A = 'a0000000-0000-4000-8000-000000000001';
const ORG_B = 'b0000000-0000-4000-8000-000000000002';

describe('explicit canonical specialist gate', () => {
  it('accepts an active canonical specialist with no org restriction or the exact requested org', () => {
    const candidate = { isActive: true, organizationId: ORG_A };

    expect(validateExplicitCanonicalCandidate(candidate, null)).toEqual({ ok: true });
    expect(validateExplicitCanonicalCandidate(candidate, ORG_A)).toEqual({ ok: true });
  });

  it('rejects a missing canonical specialist', () => {
    expect(validateExplicitCanonicalCandidate(undefined, ORG_A)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('rejects an inactive canonical even when its organization matches', () => {
    expect(
      validateExplicitCanonicalCandidate({ isActive: false, organizationId: ORG_A }, ORG_A),
    ).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it('rejects an active canonical from another organization', () => {
    expect(
      validateExplicitCanonicalCandidate({ isActive: true, organizationId: ORG_B }, ORG_A),
    ).toEqual({
      ok: false,
      reason: 'organization_mismatch',
    });
  });
});
