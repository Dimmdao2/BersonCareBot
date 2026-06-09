import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

const mockOnConflictDoUpdate = vi.fn(() => Promise.resolve());
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
  })),
}));

import { recordOperatorOutboundProbeRun } from './operatorHealthDrizzle.js';

describe('recordOperatorOutboundProbeRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it('increments consecutiveFailRuns from previous meta on fail', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ metaJson: { consecutiveFailRuns: 2 } }]);
    const r = await recordOperatorOutboundProbeRun({ max: 'fail', rubitime: 'ok', anyFail: true });
    expect(r.consecutiveFailRuns).toBe(3);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const valuesArg = mockValues.mock.calls[0]![0] as { metaJson: { consecutiveFailRuns: number } };
    expect(valuesArg.metaJson.consecutiveFailRuns).toBe(3);
  });

  it('resets consecutiveFailRuns to 0 on success', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ metaJson: { consecutiveFailRuns: 2 } }]);
    const r = await recordOperatorOutboundProbeRun({ max: 'ok', rubitime: 'ok', anyFail: false });
    expect(r.consecutiveFailRuns).toBe(0);
    const valuesArg = mockValues.mock.calls[0]![0] as {
      lastSuccessAt: string | null;
      metaJson: { consecutiveFailRuns: number };
    };
    expect(valuesArg.metaJson.consecutiveFailRuns).toBe(0);
    expect(valuesArg.lastSuccessAt).not.toBeNull();
  });

  it('starts streak at 1 when no previous row', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    const r = await recordOperatorOutboundProbeRun({ max: 'fail', rubitime: 'skipped_not_configured', anyFail: true });
    expect(r.consecutiveFailRuns).toBe(1);
  });

  it('on conflict fail path does not set lastSuccessAt in update set', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    await recordOperatorOutboundProbeRun({ max: 'fail', rubitime: 'ok', anyFail: true });
    const conflictSet = mockOnConflictDoUpdate.mock.calls[0]![0].set as Record<string, unknown>;
    expect(conflictSet).not.toHaveProperty('lastSuccessAt');
    expect(conflictSet.lastStatus).toBe('failure');
  });
});
