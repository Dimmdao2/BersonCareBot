import { describe, expect, it } from 'vitest';
import { redactSettingValueForAudit } from './auditRedaction';
import { redactAdminSettingsForClient } from './webPushVapidRuntime';
import { ALLOWED_KEYS, SYSTEM_SETTING_REGISTRY } from './registry';
import type { SystemSetting } from './types';

const PUBLIC_OAUTH_IDENTIFIER_KEYS = [
  'apple_oauth_client_id',
  'apple_oauth_key_id',
  'apple_oauth_team_id',
  'google_client_id',
  'vk_id_application_id',
  'yandex_oauth_client_id',
] as const;

describe('integration credential audit redaction', () => {
  it.each([
    'max_bot_api_key',
    'max_webhook_secret',
    'telegram_bot_token',
    'telegram_webhook_secret',
    'vk_community_access_token',
    'vk_callback_secret',
    'vk_callback_confirmation_token',
    'smsc_api_key',
  ])('redacts the complete value for %s', (key) => {
    expect(redactSettingValueForAudit(key, { value: 'credential' })).toBe('[REDACTED]');
  });

  it('keeps non-secret runtime configuration inspectable', () => {
    expect(redactSettingValueForAudit('smsc_base_url', { value: 'https://smsc.ru' })).toEqual({
      value: 'https://smsc.ru',
    });
  });

  it('never returns a runtime integration credential to the settings client', () => {
    const row: SystemSetting = {
      key: 'telegram_bot_token',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: 'credential' },
      updatedAt: '2026-08-02T00:00:00.000Z',
      updatedBy: null,
    };

    expect(redactAdminSettingsForClient([row])[0]?.valueJson).toEqual({
      value: '[REDACTED]',
    });
  });

  // #1071: independent audit (2026-09-02) found these three keys carry live secret material into
  // `system_settings_audit` verbatim — neither hand-maintained denylist in the old `auditRedaction.ts`
  // knew about them. Each case below asserts against the RAW secret substring (not just "is there a
  // [REDACTED] token somewhere"), so a regression that stops redacting shows up as a leaked string,
  // not just a shape mismatch.
  describe('closes the #1071 gap: web_push_vapid, booking_payment_providers, saas_billing_payment_provider', () => {
    it('redacts only value.privateKey for web_push_vapid, keeping the public key inspectable', () => {
      const secret = 'vapid-private-do-not-leak-7d21';
      const result = redactSettingValueForAudit('web_push_vapid', {
        value: { publicKey: 'pub-key-abc', privateKey: secret },
      });
      expect(result).toEqual({ value: { publicKey: 'pub-key-abc', privateKey: '[REDACTED]' } });
      expect(JSON.stringify(result)).not.toContain(secret);
    });

    it('keeps a cleared web_push_vapid private key distinguishable from a configured one', () => {
      expect(
        redactSettingValueForAudit('web_push_vapid', {
          value: { publicKey: 'pub-key-abc', privateKey: '' },
        }),
      ).toEqual({ value: { publicKey: 'pub-key-abc', privateKey: '' } });
      expect(redactSettingValueForAudit('web_push_vapid', null)).toBeNull();
    });

    it('fails closed when a VAPID envelope has an unrecognized secret-bearing object shape', () => {
      const unknownSecret = 'vapid-private-under-an-unknown-field-5b4c';
      const result = redactSettingValueForAudit('web_push_vapid', {
        value: { publicKey: 'pub-key-abc', signingPrivateKey: unknownSecret },
      });

      expect(result).toBe('[REDACTED]');
      expect(JSON.stringify(result)).not.toContain(unknownSecret);
    });

    it('redacts every provider secret field for booking_payment_providers', () => {
      const webhookSecret = 'whsec_do-not-leak-4c19';
      const apiKey = 'ak_live_do-not-leak-9f31';
      const result = redactSettingValueForAudit('booking_payment_providers', {
        value: {
          enabled: true,
          defaultProviderId: 'yookassa',
          providers: [
            { id: 'yookassa', label: 'ЮKassa', enabled: true, webhookSecret, apiKey },
            { id: 'tinkoff', label: 'Тинькофф Касса', enabled: false },
          ],
        },
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(webhookSecret);
      expect(serialized).not.toContain(apiKey);
      expect(result).toMatchObject({
        value: {
          providers: [
            expect.objectContaining({
              id: 'yookassa',
              webhookSecret: '[REDACTED]',
              apiKey: '[REDACTED]',
            }),
            expect.objectContaining({ id: 'tinkoff' }),
          ],
        },
      });
    });

    it('redacts every provider secret field for saas_billing_payment_provider', () => {
      const webhookSecret = 'whsec_platform-do-not-leak-2e88';
      const apiKey = 'ak_live_platform-do-not-leak-5b03';
      const result = redactSettingValueForAudit('saas_billing_payment_provider', {
        value: {
          defaultProviderId: 'yookassa',
          providers: [{ id: 'yookassa', label: 'ЮKassa', enabled: true, webhookSecret, apiKey }],
        },
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(webhookSecret);
      expect(serialized).not.toContain(apiKey);
      expect(result).toMatchObject({
        value: {
          providers: [
            expect.objectContaining({
              id: 'yookassa',
              webhookSecret: '[REDACTED]',
              apiKey: '[REDACTED]',
            }),
          ],
        },
      });
    });

    it.each(['booking_payment_providers', 'saas_billing_payment_provider'] as const)(
      'fails closed for unknown-provider credential fields in %s',
      (key) => {
        const unknownSecret = 'future-provider-client-secret-c67a';
        const knownSecret = 'future-provider-api-key-8f31';
        const result = redactSettingValueForAudit(key, {
          value: {
            defaultProviderId: 'future-pay',
            providers: [
              {
                id: 'future-pay',
                label: 'Future Pay',
                enabled: true,
                clientSecret: unknownSecret,
                apiKey: knownSecret,
              },
            ],
          },
        });

        expect(JSON.stringify(result)).not.toContain(unknownSecret);
        expect(JSON.stringify(result)).not.toContain(knownSecret);
      },
    );
  });

  describe('fails closed on a malformed or missing secret shape', () => {
    it('object_field: a non-object composite envelope is redacted whole, not passed through', () => {
      const raw = 'looks-like-plaintext-not-the-expected-shape';
      expect(redactSettingValueForAudit('smtp_outbound', { value: raw })).toBe('[REDACTED]');
      expect(redactSettingValueForAudit('smtp_outbound', raw)).toBe('[REDACTED]');
    });

    it('domain_redactor: a non-object composite envelope is redacted whole, not passed through', () => {
      const raw = 'sk_live_should-never-appear-in-the-ledger';
      expect(redactSettingValueForAudit('booking_payment_providers', raw)).toBe('[REDACTED]');
      expect(redactSettingValueForAudit('saas_billing_payment_provider', raw)).toBe('[REDACTED]');
    });

    it('an unrecognized key is redacted whole rather than passed through as-is', () => {
      // Cannot happen through the write chokepoint (ALLOWED_KEYS gates it) but must not silently
      // show a secret if it ever does — see the module's `policyForKey` fallback.
      expect(redactSettingValueForAudit('not_a_real_setting_key', { value: 'whatever' })).toBe(
        '[REDACTED]',
      );
    });

    it.each(PUBLIC_OAUTH_IDENTIFIER_KEYS)(
      'keeps a normal %s visible but rejects an object carrying a neighboring credential',
      (key) => {
        const publicIdentifier = `${key}-public-id`;
        expect(redactSettingValueForAudit(key, { value: publicIdentifier })).toEqual({
          value: publicIdentifier,
        });

        const neighboringSecret = `${key}-neighboring-client-secret`;
        const malformed = redactSettingValueForAudit(key, {
          value: { clientId: publicIdentifier, clientSecret: neighboringSecret },
        });
        expect(malformed).toBe('[REDACTED]');
        expect(JSON.stringify(malformed)).not.toContain(neighboringSecret);
      },
    );

    it.each(['smtp_outbound', 'clinic_smtp_outbound', 'operator_health_imap'])(
      'redacts the password while retaining public connection metadata for %s',
      (key) => {
        const password = `${key}-password-do-not-leak`;
        const result = redactSettingValueForAudit(key, {
          value: { host: 'mail.example.test', password },
        });
        expect(result).toEqual({
          value: { host: 'mail.example.test', password: '[REDACTED]' },
        });
        expect(JSON.stringify(result)).not.toContain(password);
      },
    );
  });

  describe('registry census (#1071 §6 step 7)', () => {
    const SECRET_ENVELOPE_KEYS = ALLOWED_KEYS.filter(
      (key) => SYSTEM_SETTING_REGISTRY[key].valueContract === 'secret_envelope',
    );

    it('has exactly 31 secret_envelope-labeled keys', () => {
      expect(SECRET_ENVELOPE_KEYS.length).toBe(31);
    });

    it('every secret_envelope key carries an explicit, non-default-only secretAudit policy', () => {
      for (const key of SECRET_ENVELOPE_KEYS) {
        expect(SYSTEM_SETTING_REGISTRY[key].secretAudit.kind).not.toBeUndefined();
      }
    });

    it('classifies exactly the six public OAuth identifiers as non-secret (kind: none)', () => {
      const noneKeys = SECRET_ENVELOPE_KEYS.filter(
        (key) => SYSTEM_SETTING_REGISTRY[key].secretAudit.kind === 'none',
      ).sort();
      expect(noneKeys).toEqual([...PUBLIC_OAUTH_IDENTIFIER_KEYS].sort());
    });

    it('classifies exactly the 19 scalar secrets as whole_value', () => {
      const wholeValueKeys = SECRET_ENVELOPE_KEYS.filter(
        (key) => SYSTEM_SETTING_REGISTRY[key].secretAudit.kind === 'whole_value',
      );
      expect(wholeValueKeys.length).toBe(19);
      for (const key of wholeValueKeys) {
        expect(redactSettingValueForAudit(key, { value: `${key}-secret` })).toBe('[REDACTED]');
      }
    });

    it('classifies exactly the 4 password-bearing composites as object_field', () => {
      const objectFieldKeys = SECRET_ENVELOPE_KEYS.filter(
        (key) => SYSTEM_SETTING_REGISTRY[key].secretAudit.kind === 'object_field',
      ).sort();
      expect(objectFieldKeys).toEqual(
        ['clinic_smtp_outbound', 'operator_health_imap', 'smtp_outbound', 'web_push_vapid'].sort(),
      );
    });

    it('classifies exactly the 2 payment-provider composites as domain_redactor', () => {
      const domainKeys = SECRET_ENVELOPE_KEYS.filter(
        (key) => SYSTEM_SETTING_REGISTRY[key].secretAudit.kind === 'domain_redactor',
      ).sort();
      expect(domainKeys).toEqual(
        ['booking_payment_providers', 'saas_billing_payment_provider'].sort(),
      );
    });

    it('never classifies a runtime-storage key as a secret', () => {
      for (const key of ALLOWED_KEYS) {
        if (SYSTEM_SETTING_REGISTRY[key].storage === 'runtime') {
          expect(SYSTEM_SETTING_REGISTRY[key].secretAudit.kind).toBe('none');
        }
      }
    });
  });
});
