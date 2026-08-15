import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const canonicalIdentity = vi.hoisted(() => ({
  read: vi.fn(),
}));

vi.mock('../../db/repos/platformUserDeliveryPhone.js', () => ({
  getCanonicalPlatformUserDeliveryIdentity: canonicalIdentity.read,
}));

const { resolveLinkedPhoneForPlatformUser } = await import('./doctorBroadcastIntentMenu.js');

const db = {} as DbPort;

describe('doctor broadcast canonical linked phone', () => {
  it('uses only the canonical platform-user delivery identity', async () => {
    canonicalIdentity.read.mockResolvedValueOnce({
      phoneNormalized: '+79990000000',
      integratorUserId: '42',
    });

    await expect(resolveLinkedPhoneForPlatformUser(db, 'patient-id')).resolves.toEqual({
      linkedPhone: true,
      integratorUserId: '42',
    });
    expect(canonicalIdentity.read).toHaveBeenCalledWith(db, 'patient-id');
  });

  it('treats an absent canonical phone as unlinked', async () => {
    canonicalIdentity.read.mockResolvedValueOnce({ phoneNormalized: null, integratorUserId: '42' });

    await expect(resolveLinkedPhoneForPlatformUser(db, 'patient-id')).resolves.toEqual({
      linkedPhone: false,
      integratorUserId: '42',
    });
  });

  it('propagates a database failure into the worker retry/error path', async () => {
    canonicalIdentity.read.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(resolveLinkedPhoneForPlatformUser(db, 'patient-id')).rejects.toThrow(
      'database unavailable',
    );
  });
});
