import { describe, expect, it } from 'vitest';
import { resolveVerifiedLeadApplicant } from './resolveVerifiedLeadApplicant';

/**
 * Оракул — канон идентичности §18в: телефон из заявки идентичностью не становится. Тест стережёт
 * именно это: заявитель — учётная запись подтверждённой ПОЧТЫ, кто бы ни был владельцем телефона.
 */
describe('verified lead identity resolution', () => {
  it('keeps the verified email account as the applicant even when a phone is submitted', async () => {
    const result = await resolveVerifiedLeadApplicant({
      organizationId: 'org-a',
      verifiedEmailUserId: 'email-account',
      emailNormalized: 'person@example.com',
      submittedPhone: '+79991234567',
    });
    expect(result).toEqual({
      platformUserId: 'email-account',
      emailNormalized: 'person@example.com',
      proof: 'email_otp',
    });
  });

  it('rejects a malformed phone as an input error, not as an identity', async () => {
    await expect(
      resolveVerifiedLeadApplicant({
        organizationId: 'org-a',
        verifiedEmailUserId: 'email-account',
        emailNormalized: 'person@example.com',
        submittedPhone: '12345',
      }),
    ).rejects.toThrow('invalid_lead_phone');
  });
});
