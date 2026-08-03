import { describe, expect, it } from 'vitest';
import { isWebhookSecretValid } from './webhookSecretCompare.js';

describe('isWebhookSecretValid', () => {
  it('accepts a header that matches the configured secret exactly', () => {
    expect(isWebhookSecretValid('correct-secret', 'correct-secret')).toBe(true);
  });

  it('rejects a forged secret, including one sharing a long correct prefix', () => {
    expect(isWebhookSecretValid('wrong-secret', 'correct-secret')).toBe(false);
    expect(isWebhookSecretValid('correct-secre-but-not-quite', 'correct-secret')).toBe(false);
  });

  it('rejects a missing or empty header without throwing', () => {
    expect(isWebhookSecretValid(undefined, 'correct-secret')).toBe(false);
    expect(isWebhookSecretValid('', 'correct-secret')).toBe(false);
  });

  it('rejects an array header (repeated header case) without throwing', () => {
    expect(isWebhookSecretValid(['correct-secret', 'correct-secret'], 'correct-secret')).toBe(
      false,
    );
  });

  it('rejects when no secret is configured, even against an empty header', () => {
    expect(isWebhookSecretValid('', undefined)).toBe(false);
    expect(isWebhookSecretValid('anything', '')).toBe(false);
  });

  it('rejects differing lengths without throwing (timingSafeEqual requires equal length)', () => {
    expect(isWebhookSecretValid('short', 'a-much-longer-secret-value')).toBe(false);
  });
});
