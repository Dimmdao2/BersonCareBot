import { describe, expect, it, vi } from 'vitest';
import { withRubitimeApiThrottle } from './rubitimeApiThrottle.js';

describe('withRubitimeApiThrottle', () => {
  it('in test env skips DB and runs fn', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRubitimeApiThrottle(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
