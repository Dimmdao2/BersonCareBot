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

  it('maps an unavailable webapp lookup to the same explicit empty-audience behavior', async () => {
    const getAdminMessengerTargets = vi.fn(async () => null);

    await expect(
      loadAdminMessengerIdLists({ getAdminMessengerTargets }),
    ).resolves.toEqual({ telegram: [], max: [] });
  });
});
