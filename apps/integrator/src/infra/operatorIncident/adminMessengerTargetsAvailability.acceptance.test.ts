import { describe, expect, it, vi } from 'vitest';
import { loadAdminMessengerIdLists } from './operatorHealthAlertConfigIntegrator.js';

describe('global admin messenger target availability', () => {
  it('does not collapse an unavailable signed webapp lookup into a successful empty audience', async () => {
    const getAdminMessengerTargets = vi.fn(async () => null);

    await expect(
      loadAdminMessengerIdLists({ getAdminMessengerTargets }),
    ).rejects.toThrow('admin_notification_targets_unavailable');
  });
});
