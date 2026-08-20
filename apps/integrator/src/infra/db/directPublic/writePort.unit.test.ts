import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  currentOrganizationId: vi.fn(),
  runWithOrganization: vi.fn(async <T>(_organizationId: string, fn: () => Promise<T>) => fn()),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: fakes.currentOrganizationId,
}));
vi.mock('../../principal/organizationPrincipal.js', () => ({
  runWithOrganizationPrincipal: fakes.runWithOrganization,
}));

import { writeDirectPublic, type DirectPublicWriteOperation } from './writePort.js';

const operations: readonly DirectPublicWriteOperation[] = [
  'identity-upsert',
  'phone-bind',
  'reminder-rule-upsert',
  'reminder-occurrence-finalize',
  'reminder-delivery-append',
  'content-access-grant-upsert',
  'support-delivery-append',
];

describe('direct public write port', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.currentOrganizationId.mockReturnValue('org-ambient');
  });

  it.each(operations)('runs %s under the ambient organization principal', async (operation) => {
    const write = vi.fn().mockResolvedValue('written');

    await expect(writeDirectPublic(operation, write)).resolves.toBe('written');

    expect(fakes.runWithOrganization).toHaveBeenCalledWith('org-ambient', write);
  });

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

    await expect(writeDirectPublic('identity-upsert', write)).resolves.toBe('written');

    expect(write).toHaveBeenCalledOnce();
    expect(fakes.runWithOrganization).not.toHaveBeenCalled();
  });
});
