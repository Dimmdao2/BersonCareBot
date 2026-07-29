import { describe, it, expect } from 'vitest';
import {
  allowsPlatformGlobalFallbackWrite,
  isPerOrgSettingKey,
  SYSTEM_SETTINGS_ORG_SCOPE,
} from './orgScopedKeys';
import { ALLOWED_KEYS } from './types';

describe('orgScopedKeys — P0.11.3 org-aware write classification', () => {
  it('isPerOrgSettingKey — true for a representative sample of PER-ORG keys', () => {
    const perOrgSample = [
      'patient_label',
      'patient_default_promo_treatment_program_template_id',
      'notif_template:created:patient',
      'booking_payment_providers',
      'patient_home_mood_icons',
    ];
    for (const key of perOrgSample) {
      expect(isPerOrgSettingKey(key)).toBe(true);
    }
  });

  it('isPerOrgSettingKey — false for a representative sample of GLOBAL keys', () => {
    const globalSample = [
      'dev_mode',
      'admin_phones',
      'smtp_outbound',
      'booking_rubitime_bridge_enabled',
    ];
    for (const key of globalSample) {
      expect(isPerOrgSettingKey(key)).toBe(false);
    }
  });

  it('SYSTEM_SETTINGS_ORG_SCOPE has exactly one entry per key in ALLOWED_KEYS (guards against drift)', () => {
    const scopeKeys = Object.keys(SYSTEM_SETTINGS_ORG_SCOPE);
    expect(scopeKeys.length).toBe(ALLOWED_KEYS.length);
    for (const key of ALLOWED_KEYS) {
      expect(scopeKeys).toContain(key);
    }
  });

  it('limits platform NULL fallback writes to notification templates', () => {
    expect(allowsPlatformGlobalFallbackWrite('notif_template:created:patient')).toBe(true);
    expect(allowsPlatformGlobalFallbackWrite('patient_label')).toBe(false);
    expect(allowsPlatformGlobalFallbackWrite('smtp_outbound')).toBe(false);
  });
});
