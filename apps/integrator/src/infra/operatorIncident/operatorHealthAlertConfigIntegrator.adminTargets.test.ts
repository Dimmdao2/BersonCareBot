import { describe, expect, it, vi } from 'vitest';
import { loadAdminMessengerIdLists } from './operatorHealthAlertConfigIntegrator.js';

describe('loadAdminMessengerIdLists', () => {
  it('delegates global recipient ownership to the signed webapp port', async () => {
    const getAdminMessengerTargets = vi.fn(async () => ({
      telegram: ['101'],
      max: ['202'],
    }));

    await expect(
      loadAdminMessengerIdLists({ getAdminMessengerTargets }),
    ).resolves.toEqual({ telegram: ['101'], max: ['202'] });
    expect(getAdminMessengerTargets).toHaveBeenCalledWith();
  });

  it('keeps unavailable distinct from a valid empty audience', async () => {
    const getAdminMessengerTargets = vi.fn(async () => null);

    await expect(
      loadAdminMessengerIdLists({ getAdminMessengerTargets }),
    ).rejects.toThrow('admin_notification_targets_unavailable');
  });

  it('preserves a valid empty audience returned by webapp', async () => {
    const getAdminMessengerTargets = vi.fn(async () => ({ telegram: [], max: [] }));

    await expect(
      loadAdminMessengerIdLists({ getAdminMessengerTargets }),
    ).resolves.toEqual({ telegram: [], max: [] });
  });
});
