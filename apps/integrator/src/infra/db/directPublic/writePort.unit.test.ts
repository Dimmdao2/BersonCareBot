import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  currentOrganizationId: vi.fn(),
  runWithOrganization: vi.fn(async <T>(_organizationId: string, fn: () => Promise<T>) => fn()),
  runWithBootstrap: vi.fn(async <T>(_input: { source?: string }, fn: () => Promise<T>) => fn()),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: fakes.currentOrganizationId,
}));
vi.mock('../../principal/organizationPrincipal.js', () => ({
  runWithOrganizationPrincipal: fakes.runWithOrganization,
  runWithBootstrapPrincipal: fakes.runWithBootstrap,
}));

import { writeDirectPublic, type DirectPublicWriteOperation } from './writePort.js';

const organizationOperations: readonly DirectPublicWriteOperation[] = [
  'admin-audit-write',
  'reminder-rule-upsert',
  'reminder-occurrence-finalize',
  'reminder-delivery-append',
  'content-access-grant-upsert',
  'support-delivery-append',
];

/**
 * D25/K5: each of these is ONE exact named root whose declared capability
 * (`contextClass=integrator` + `targetRole=app_integrator_resolver`) is selectable only under the
 * bootstrap principal. The Telegram/MAX webhook installs an integrator/organization principal
 * whenever the clinic is already resolved, so without this re-entry the root is refused outright.
 */
const bootstrapOperations: readonly DirectPublicWriteOperation[] = ['identity-upsert', 'phone-bind'];

describe('direct public write port', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.currentOrganizationId.mockReturnValue('org-ambient');
  });

  it.each(organizationOperations)(
    'runs %s under the ambient organization principal',
    async (operation) => {
      const write = vi.fn().mockResolvedValue('written');

      await expect(writeDirectPublic(operation, write)).resolves.toBe('written');

      expect(fakes.runWithOrganization).toHaveBeenCalledWith('org-ambient', write);
      expect(fakes.runWithBootstrap).not.toHaveBeenCalled();
    },
  );

  it.each(bootstrapOperations)(
    'runs %s under the bootstrap principal its named root accepts, even when an organization is ambient',
    async (operation) => {
      const write = vi.fn().mockResolvedValue('written');

      await expect(writeDirectPublic(operation, write)).resolves.toBe('written');

      expect(fakes.runWithBootstrap).toHaveBeenCalledWith(
        { source: `direct-public:${operation}` },
        write,
      );
      expect(fakes.runWithOrganization).not.toHaveBeenCalled();
    },
  );

  it('uses an explicit organization principal for retry writes', async () => {
    const write = vi.fn().mockResolvedValue('written');

    await expect(
      writeDirectPublic('support-delivery-append', write, { organizationId: 'org-retry' }),
    ).resolves.toBe('written');

    expect(fakes.runWithOrganization).toHaveBeenCalledWith('org-retry', write);
  });

  it('preserves bootstrap behavior when no organization is available', async () => {
    fakes.currentOrganizationId.mockReturnValue(undefined);
    const write = vi.fn().mockResolvedValue('written');

    await expect(writeDirectPublic('admin-audit-write', write)).resolves.toBe('written');

    expect(write).toHaveBeenCalledOnce();
    expect(fakes.runWithOrganization).not.toHaveBeenCalled();
  });
});
