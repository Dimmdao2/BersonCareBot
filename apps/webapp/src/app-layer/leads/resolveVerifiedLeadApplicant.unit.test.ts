import { describe, expect, it, vi } from 'vitest';
import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { resolveVerifiedLeadApplicant } from './resolveVerifiedLeadApplicant';

describe('verified lead identity resolution', () => {
  it('uses the confirmed-phone account as the single identity and adds the verified email to it', async () => {
    const findTrustedPhoneOwner = vi.fn(async () => 'phone-account');
    const claimEmail = vi.fn(async () => ({ ok: true as const, merged: true }));
    const result = await resolveVerifiedLeadApplicant(
      {
        organizationId: 'org-a',
        verifiedEmailUserId: 'email-account',
        emailNormalized: 'person@example.com',
        submittedPhone: '+79991234567',
      },
      {
        db: {} as WebappSqlExecutor,
        findTrustedPhoneOwner,
        claimEmail,
      },
    );
    expect(result).toEqual({
      platformUserId: 'phone-account',
      emailNormalized: 'person@example.com',
      proof: 'email_otp',
    });
    expect(claimEmail).toHaveBeenCalledWith('phone-account', 'person@example.com', {
      profileBindOrganizationId: 'org-a',
    });
  });

  it('does not merge on an unconfirmed or unknown submitted phone', async () => {
    const claimEmail = vi.fn(async () => ({ ok: true as const, merged: true }));
    const result = await resolveVerifiedLeadApplicant(
      {
        organizationId: 'org-a',
        verifiedEmailUserId: 'email-account',
        emailNormalized: 'person@example.com',
        submittedPhone: '+79991234567',
      },
      {
        db: {} as WebappSqlExecutor,
        findTrustedPhoneOwner: vi.fn(async () => null),
        claimEmail,
      },
    );
    expect(result.platformUserId).toBe('email-account');
    expect(claimEmail).not.toHaveBeenCalled();
  });
});
