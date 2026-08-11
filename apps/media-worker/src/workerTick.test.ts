import { describe, expect, it, vi } from 'vitest';
import type { MediaWorkerControlPort } from './control.js';
import type { MediaWorkerTickContext } from './workerTick.js';

const processTranscodeJob = vi.fn(async () => undefined);
vi.mock('./processTranscodeJob.js', () => ({ processTranscodeJob }));
const { runMediaWorkerTick } = await import('./workerTick.js');

function context(control: MediaWorkerControlPort): MediaWorkerTickContext {
  return {
    control,
    lockId: 'worker-a',
    staleLockMinutes: 30,
    log: { debug: vi.fn(), info: vi.fn() },
  } as unknown as MediaWorkerTickContext;
}

function control(claim: MediaWorkerControlPort['claim']): MediaWorkerControlPort {
  return {
    ready: vi.fn(), claim, load: vi.fn(), watermarkEnabled: vi.fn(), processing: vi.fn(), retry: vi.fn(),
    failed: vi.fn(), doneHls: vi.fn(), doneProgram: vi.fn(),
  };
}

describe('runMediaWorkerTick', () => {
  it('does not process a disabled or idle queue, and processes exactly one claimed job', async () => {
    const disabledClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'disabled' as const }));
    const disabled = control(disabledClaim);
    await expect(runMediaWorkerTick(context(disabled))).resolves.toBe('disabled');
    const idleClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'idle' as const }));
    const idle = control(idleClaim);
    await expect(runMediaWorkerTick(context(idle))).resolves.toBe('idle');
    const claimedClaim: MediaWorkerControlPort['claim'] = vi.fn(async () => ({ kind: 'claimed' as const, job: { id: 'job-1', mediaId: 'media-1', organizationId: 'org-1', attempts: 1 } }));
    const claimed = control(claimedClaim);
    await expect(runMediaWorkerTick(context(claimed))).resolves.toBe('processed');
    expect(processTranscodeJob).toHaveBeenCalledTimes(1);
    expect(claimedClaim).toHaveBeenCalledWith('worker-a', 30);
  });
});
