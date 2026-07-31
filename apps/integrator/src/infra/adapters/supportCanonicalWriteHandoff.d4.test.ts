import { describe, expect, it, vi } from 'vitest';
import { executeCanonicalWriteOrLegacy } from './supportCanonicalWriteHandoff.js';

describe('D4 webapp canonical write handoff', () => {
  it('executes the canonical acknowledgement and does not write product canon itself', async () => {
    const legacyWrite = vi.fn().mockResolvedValue(undefined);

    const handled = await executeCanonicalWriteOrLegacy<{
      questionId: string;
      organizationId: string;
    }>({
      sync: vi.fn().mockResolvedValue({
        ok: true,
        canonicalWrite: {
          questionId: 'question-1',
          organizationId: '11111111-1111-4111-8111-111111111111',
        },
      }),
      accepts: (write) => write.questionId === 'question-1',
      legacyWrite,
    });

    expect(handled).toBe(true);
    expect(legacyWrite).not.toHaveBeenCalled();
  });

  it('preserves the previous local write when an older webapp omits canonicalWrite', async () => {
    const legacyWrite = vi.fn().mockResolvedValue(undefined);

    const handled = await executeCanonicalWriteOrLegacy<{
      questionId: string;
      organizationId: string;
    }>({
      sync: vi.fn().mockResolvedValue({ ok: true }),
      accepts: () => true,
      legacyWrite,
    });

    expect(handled).toBe(false);
    expect(legacyWrite).toHaveBeenCalledTimes(1);
  });

  it('rejects a canonical acknowledgement for another natural key and keeps the legacy path', async () => {
    const legacyWrite = vi.fn().mockResolvedValue(undefined);

    const handled = await executeCanonicalWriteOrLegacy<{
      questionId: string;
      organizationId: string;
    }>({
      sync: vi.fn().mockResolvedValue({
        ok: true,
        canonicalWrite: {
          questionId: 'question-foreign',
          organizationId: '11111111-1111-4111-8111-111111111111',
        },
      }),
      accepts: (write) => write.questionId === 'question-1',
      legacyWrite,
    });

    expect(handled).toBe(false);
    expect(legacyWrite).toHaveBeenCalledTimes(1);
  });
});
