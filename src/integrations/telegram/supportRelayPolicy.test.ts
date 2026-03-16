import { describe, expect, it } from 'vitest';
import { createSupportRelayPolicy } from './supportRelayPolicy.js';
import type { SupportRelayMessageType } from './supportRelayTypes.js';

describe('supportRelayPolicy', () => {
  it('allows only configured user->admin types', () => {
    const policy = createSupportRelayPolicy({
      allowedUserToAdminMessageTypes: ['text', 'photo'] as SupportRelayMessageType[],
      allowedAdminToUserMessageTypes: ['text', 'photo', 'document'],
    });
    expect(policy.isAllowedUserToAdmin('text')).toBe(true);
    expect(policy.isAllowedUserToAdmin('photo')).toBe(true);
    expect(policy.isAllowedUserToAdmin('document')).toBe(false);
    expect(policy.isAllowedUserToAdmin('voice')).toBe(false);
    expect(policy.isAllowedUserToAdmin('unknown')).toBe(false);
  });

  it('allows only configured admin->user types', () => {
    const policy = createSupportRelayPolicy({
      allowedUserToAdminMessageTypes: ['text'],
      allowedAdminToUserMessageTypes: ['text', 'document', 'sticker'] as SupportRelayMessageType[],
    });
    expect(policy.isAllowedAdminToUser('text')).toBe(true);
    expect(policy.isAllowedAdminToUser('document')).toBe(true);
    expect(policy.isAllowedAdminToUser('sticker')).toBe(true);
    expect(policy.isAllowedAdminToUser('photo')).toBe(false);
    expect(policy.isAllowedAdminToUser('voice')).toBe(false);
  });
});
