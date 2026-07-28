import { describe, expect, it } from 'vitest';
import type { SystemSettingsService } from '@/modules/system-settings/service';
import { deriveVapidSubject, vapidSubjectFromSmtpParsed } from './vapidSubject';
import { smtpInnerFromValueJson } from '@/modules/system-settings/smtpOutboundPatch';

function settings(rows: Record<string, { valueJson: unknown } | null>) {
  return {
    getSetting: async (key: string) => rows[key] ?? null,
  } as Pick<SystemSettingsService, 'getSetting'>;
}

describe('VAPID subject', () => {
  it('uses DB-backed HTTPS app_base_url when TEST intentionally disables SMTP', async () => {
    const result = await deriveVapidSubject(
      settings({
        smtp_outbound: { valueJson: { value: null } },
        app_base_url: { valueJson: { value: 'https://test.bersoncare.ru/path' } },
      }),
    );

    expect(result).toBe('https://test.bersoncare.ru');
  });

  it('keeps a valid SMTP contact as the preferred subject', () => {
    const smtp = smtpInnerFromValueJson({
      value: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'sender',
        password: 'secret',
        from: 'support@example.com',
      },
    });

    expect(vapidSubjectFromSmtpParsed(smtp, 'https://test.bersoncare.ru')).toBe(
      'mailto:support@example.com',
    );
  });

  it('fails closed when neither SMTP nor a valid HTTPS contact exists', () => {
    const smtp = smtpInnerFromValueJson({ value: null });
    expect(vapidSubjectFromSmtpParsed(smtp, null)).toBeNull();
    expect(vapidSubjectFromSmtpParsed(smtp, 'http://127.0.0.1:6300')).toBeNull();
  });
});
