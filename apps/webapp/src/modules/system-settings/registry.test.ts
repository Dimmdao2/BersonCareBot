import { describe, expect, it } from 'vitest';
import {
  ALLOWED_KEYS,
  RESTRICTED_SYSTEM_SETTING_KEYS,
  RUNTIME_FLAG_DEFINITIONS,
  RUNTIME_SYSTEM_SETTING_KEYS,
  SYSTEM_SETTING_REGISTRY,
} from './registry';

describe('S5-0 system-settings registry', () => {
  it('derives the complete, duplicate-free allowlist and an exhaustive storage partition', () => {
    expect(new Set(ALLOWED_KEYS).size).toBe(ALLOWED_KEYS.length);
    expect(Object.keys(SYSTEM_SETTING_REGISTRY).sort()).toEqual([...ALLOWED_KEYS].sort());
    expect(new Set([...RUNTIME_SYSTEM_SETTING_KEYS, ...RESTRICTED_SYSTEM_SETTING_KEYS])).toEqual(
      new Set(ALLOWED_KEYS),
    );
    expect(
      RUNTIME_SYSTEM_SETTING_KEYS.some((key) => RESTRICTED_SYSTEM_SETTING_KEYS.includes(key)),
    ).toBe(false);
  });

  it('is default-deny: every key has an explicit ownership, audience and value contract', () => {
    for (const key of ALLOWED_KEYS) {
      const definition = SYSTEM_SETTING_REGISTRY[key];
      expect(definition).toBeDefined();
      expect(definition.legacySource).toBe('system_settings');
      expect(typeof definition.defaultValue).toBe('string');
    }
  });

  it('records setting, mechanic and all sources without evaluating unmerged S4 entitlements', () => {
    expect(RUNTIME_FLAG_DEFINITIONS.discussion.source).toMatchObject({ kind: 'setting' });
    expect(RUNTIME_FLAG_DEFINITIONS.booking.source).toMatchObject({
      kind: 'mechanic',
      mechanic: 'booking',
    });
    expect(RUNTIME_FLAG_DEFINITIONS.payments.source).toMatchObject({ kind: 'all' });
    expect(RUNTIME_FLAG_DEFINITIONS.patient_app.source).toMatchObject({
      kind: 'mechanic',
      mechanic: 'patient_app',
    });
    for (const definition of Object.values(RUNTIME_FLAG_DEFINITIONS)) {
      expect(definition.evaluation).toBe('deferred_until_s4_merge');
    }
  });

  it('classifies auth-channel policy as global public runtime configuration', () => {
    expect(SYSTEM_SETTING_REGISTRY.auth_email_enabled).toMatchObject({
      scope: 'admin',
      storage: 'runtime',
      ownership: 'global',
      audience: 'public',
      valueContract: 'boolean',
      defaultValue: 'true',
    });
    expect(SYSTEM_SETTING_REGISTRY.auth_sms_enabled).toMatchObject({
      scope: 'admin',
      storage: 'runtime',
      ownership: 'global',
      audience: 'public',
      valueContract: 'boolean',
      defaultValue: 'false',
    });
    for (const key of ['auth_telegram_enabled', 'auth_max_enabled'] as const) {
      expect(SYSTEM_SETTING_REGISTRY[key]).toMatchObject({
        scope: 'admin',
        storage: 'runtime',
        ownership: 'global',
        audience: 'public',
        valueContract: 'boolean',
        defaultValue: 'true',
      });
    }
  });

  it('keeps unsupported-client fallback global, public and fail-closed', () => {
    expect(SYSTEM_SETTING_REGISTRY.patient_unsupported_client_fallback_enabled).toMatchObject({
      scope: 'admin',
      storage: 'runtime',
      ownership: 'global',
      audience: 'public',
      valueContract: 'boolean',
      defaultValue: 'false',
    });
  });

  it('keeps platform integration availability global, server-only, and structured', () => {
    expect(SYSTEM_SETTING_REGISTRY.platform_integration_availability).toMatchObject({
      scope: 'admin',
      storage: 'runtime',
      ownership: 'global',
      audience: 'server',
      valueContract: 'structured',
    });
  });

  it('classifies VK ID credentials like the existing OAuth provider settings', () => {
    expect(SYSTEM_SETTING_REGISTRY.vk_id_application_id).toMatchObject({
      storage: 'restricted',
      ownership: 'global',
      valueContract: 'secret_envelope',
    });
    expect(SYSTEM_SETTING_REGISTRY.vk_id_client_secret).toMatchObject({
      storage: 'restricted',
      ownership: 'global',
      valueContract: 'secret_envelope',
      clientSerialization: 'redacted',
    });
    expect(SYSTEM_SETTING_REGISTRY.vk_id_redirect_uri).toMatchObject({
      storage: 'restricted',
      ownership: 'global',
      valueContract: 'url',
    });
  });

  it('keeps the platform merchant key global, restricted, redacted, and mock-defaulted', () => {
    expect(SYSTEM_SETTING_REGISTRY.saas_billing_payment_provider).toMatchObject({
      scope: 'admin',
      storage: 'restricted',
      ownership: 'global',
      audience: 'server',
      valueContract: 'secret_envelope',
      defaultValue: 'mock',
      clientSerialization: 'redacted',
    });
  });
});
