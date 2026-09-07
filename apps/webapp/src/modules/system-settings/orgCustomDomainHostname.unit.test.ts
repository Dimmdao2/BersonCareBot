import { describe, expect, it } from 'vitest';
import { normalizeOrgCustomDomainHostnamePatch } from './orgCustomDomainHostname';

describe('normalizeOrgCustomDomainHostnamePatch', () => {
  it('accepts a plausible fqdn and lowercases it', () => {
    expect(normalizeOrgCustomDomainHostnamePatch({ value: 'Clinic.Example.COM' })).toEqual({
      ok: true,
      valueJson: { value: 'clinic.example.com' },
    });
  });

  it('accepts empty string to clear the hostname', () => {
    expect(normalizeOrgCustomDomainHostnamePatch({ value: '   ' })).toEqual({
      ok: true,
      valueJson: { value: '' },
    });
  });

  it('rejects values with a scheme or path', () => {
    expect(normalizeOrgCustomDomainHostnamePatch({ value: 'https://clinic.example.com' })).toEqual({
      ok: false,
      error: 'invalid_value',
    });
  });
});
