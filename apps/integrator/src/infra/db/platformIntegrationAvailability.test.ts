import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { isPlatformIntegrationAvailable } from './platformIntegrationAvailability.js';

function failingDb(): DbPort {
  return {
    query: vi.fn().mockRejectedValue(new Error('connection refused')),
    tx: vi.fn(),
  } as unknown as DbPort;
}

describe('isPlatformIntegrationAvailable', () => {
  it('refuses instead of falling back to the compiled default when the read fails', async () => {
    await expect(isPlatformIntegrationAvailable(failingDb(), 'telegram')).rejects.toThrow();
  });
});
