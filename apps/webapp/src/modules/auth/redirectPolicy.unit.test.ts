import { describe, expect, it } from 'vitest';
import { getPostAuthRedirectTarget } from './redirectPolicy';

describe('role login post-auth redirect policy', () => {
  it('keeps a verified doctor on the protected deep link from their own door', () => {
    expect(
      getPostAuthRedirectTarget(
        'doctor',
        '/app/doctor/patients?tab=active',
        '/app/doctor',
        'doctor',
      ),
    ).toBe('/app/doctor/patients?tab=active');
  });

  it('returns a verified user of another role to their own cabinet with an honest denial signal', () => {
    expect(
      getPostAuthRedirectTarget('client', '/app/doctor/patients', '/app/patient', 'doctor'),
    ).toBe('/app/patient?app_access_denied=1');
  });

  it('does not accept an external continuation from a role-specific door', () => {
    expect(
      getPostAuthRedirectTarget(
        'admin',
        'https://attacker.example/app/admin',
        '/app/admin',
        'admin',
      ),
    ).toBe('/app/admin/system-health');
  });
});
