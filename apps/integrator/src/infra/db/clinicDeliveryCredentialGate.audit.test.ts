/**
 * Audit C3 round 2, item R2-4 — «включён» must mean BOTH conditions, checked in the safe order.
 *
 * Named failure this catches: the tariff mechanic gate is dropped, weakened or moved after the
 * credential read, so an organization whose clinic-bot mechanic is switched off keeps sending
 * through a stale stored bot token — or the token is read without any tariff grant at all.
 * Expensive (wrong sender identity on patient traffic, entitlement bypass) and silent (the
 * message is delivered, nobody sees a wrong sender until a patient replies to the wrong bot).
 *
 * The mirror direction matters just as much after owner decision §1.2h: mechanic on but no stored
 * token must resolve to null, because null is exactly what puts the default path back on the
 * platform sender in `dispatchPort`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveOrganizationMechanicLifecycleAccess = vi.fn();
const fetchIntegratorClinicDeliveryCredentialValueJson = vi.fn();

vi.mock('./organizationMechanicLifecycleDoor.js', () => ({
  resolveOrganizationMechanicLifecycleAccess: (...args: unknown[]) =>
    resolveOrganizationMechanicLifecycleAccess(...args),
}));

vi.mock('./publicSystemSettings.js', async () => {
  const actual = await vi.importActual<typeof import('./publicSystemSettings.js')>(
    './publicSystemSettings.js',
  );
  return {
    ...actual,
    fetchIntegratorClinicDeliveryCredentialValueJson: (...args: unknown[]) =>
      fetchIntegratorClinicDeliveryCredentialValueJson(...args),
  };
});

import { createClinicDeliveryCredentialResolver } from './clinicDeliveryCredentials.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';
import type { DbPort } from '../../kernel/contracts/index.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const db = {} as DbPort;

function storedToken(value: string): unknown {
  return { value };
}

beforeEach(() => {
  resolveOrganizationMechanicLifecycleAccess.mockReset();
  fetchIntegratorClinicDeliveryCredentialValueJson.mockReset();
});

describe('C3 R2-4: clinic delivery credential needs tariff mechanic AND a stored credential', () => {
  it('returns the clinic bot only when the mechanic is allowed and the token is stored', async () => {
    resolveOrganizationMechanicLifecycleAccess.mockResolvedValue({ mutationAllowed: true });
    fetchIntegratorClinicDeliveryCredentialValueJson.mockResolvedValue(storedToken('clinic-tg'));
    const resolve = createClinicDeliveryCredentialResolver(db);

    const credential = await runWithOrganizationPrincipal(ORG, () => resolve('telegram'));

    expect(credential).toEqual({ channel: 'telegram', botToken: 'clinic-tg' });
    expect(resolveOrganizationMechanicLifecycleAccess).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ organizationId: ORG, mechanic: 'clinic_telegram_bot' }),
    );
  });

  it('refuses the stored token when the tariff mechanic is off, and never reads it', async () => {
    resolveOrganizationMechanicLifecycleAccess.mockResolvedValue({ mutationAllowed: false });
    fetchIntegratorClinicDeliveryCredentialValueJson.mockResolvedValue(storedToken('clinic-tg'));
    const resolve = createClinicDeliveryCredentialResolver(db);

    const credential = await runWithOrganizationPrincipal(ORG, () => resolve('telegram'));

    expect(credential).toBeNull();
    expect(fetchIntegratorClinicDeliveryCredentialValueJson).not.toHaveBeenCalled();
  });

  it('returns null when the mechanic is allowed but no token is stored (default path stays platform)', async () => {
    resolveOrganizationMechanicLifecycleAccess.mockResolvedValue({ mutationAllowed: true });
    fetchIntegratorClinicDeliveryCredentialValueJson.mockResolvedValue(null);
    const resolve = createClinicDeliveryCredentialResolver(db);

    const credential = await runWithOrganizationPrincipal(ORG, () => resolve('max'));

    expect(credential).toBeNull();
  });

  it('returns null when the stored value is present but empty', async () => {
    resolveOrganizationMechanicLifecycleAccess.mockResolvedValue({ mutationAllowed: true });
    fetchIntegratorClinicDeliveryCredentialValueJson.mockResolvedValue(storedToken(''));
    const resolve = createClinicDeliveryCredentialResolver(db);

    const credential = await runWithOrganizationPrincipal(ORG, () => resolve('telegram'));

    expect(credential).toBeNull();
  });

  it('reads nothing at all without an organization principal', async () => {
    resolveOrganizationMechanicLifecycleAccess.mockResolvedValue({ mutationAllowed: true });
    fetchIntegratorClinicDeliveryCredentialValueJson.mockResolvedValue(storedToken('clinic-tg'));
    const resolve = createClinicDeliveryCredentialResolver(db);

    const credential = await resolve('telegram');

    expect(credential).toBeNull();
    expect(resolveOrganizationMechanicLifecycleAccess).not.toHaveBeenCalled();
    expect(fetchIntegratorClinicDeliveryCredentialValueJson).not.toHaveBeenCalled();
  });
});
