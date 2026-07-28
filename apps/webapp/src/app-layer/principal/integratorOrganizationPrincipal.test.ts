import { beforeEach, describe, expect, it } from 'vitest';
import { enterWithDbBootstrapPrincipal, getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { enterVerifiedIntegratorOrganizationPrincipal } from './integratorOrganizationPrincipal';

describe('enterVerifiedIntegratorOrganizationPrincipal', () => {
  beforeEach(() => enterWithDbBootstrapPrincipal({ source: 'test-reset' }));

  it('rejects a missing or malformed tenant without changing the bootstrap principal', () => {
    expect(enterVerifiedIntegratorOrganizationPrincipal('not-an-org', 'signed-m2m')).toBe(false);
    expect(getCurrentDbPrincipal()).toMatchObject({ kind: 'bootstrap' });
  });

  it('installs the signed request organization as the DB principal', () => {
    expect(
      enterVerifiedIntegratorOrganizationPrincipal(
        '11111111-1111-4111-8111-111111111111',
        'signed-m2m',
      ),
    ).toBe(true);
    expect(getCurrentDbPrincipal()).toMatchObject({
      kind: 'organization',
      organizationId: '11111111-1111-4111-8111-111111111111',
      source: 'signed-m2m',
    });
  });
});
