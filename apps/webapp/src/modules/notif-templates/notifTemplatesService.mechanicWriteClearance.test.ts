import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createNotifTemplatesService } from './notifTemplatesService';
import { createDefaultManagedNotifTemplate } from './managedNotifTemplate';

const defaultChannels = createDefaultManagedNotifTemplate('created', 'patient').channels;

function buildService() {
  const updateSettingIfUnchanged = vi.fn(async () => ({
    id: 'row-1',
    key: 'notif_template:created:patient',
    scope: 'admin',
    valueJson: { value: 'text', managed: {} },
    organizationId: 'org-1',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: 'user-1',
  }));
  const systemSettings = {
    getSetting: vi.fn(async () => null),
    updateSetting: vi.fn(async () => ({}) as never),
    updateSettingIfUnchanged,
  };
  const service = createNotifTemplatesService(systemSettings as never, {
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, updateSettingIfUnchanged };
}

describe('notif-templates service — 3.2 physical door (branding)', () => {
  it('refuses saveManagedTemplate when no branding mutation decision ran first', async () => {
    const { service, updateSettingIfUnchanged } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.saveManagedTemplate(
          'created',
          'patient',
          defaultChannels,
          'user-1',
          null,
          { organizationId: 'org-1' },
        ),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(updateSettingIfUnchanged).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared branding for this continuation', async () => {
    const { service, updateSettingIfUnchanged } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('branding');
      const entry = await service.saveManagedTemplate(
        'created',
        'patient',
        defaultChannels,
        'user-1',
        null,
        { organizationId: 'org-1' },
      );
      expect(entry.event).toBe('created');
    });
    expect(updateSettingIfUnchanged).toHaveBeenCalledOnce();
  });
});
