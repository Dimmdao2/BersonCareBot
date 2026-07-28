import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

type ProbeRunValues = {
  metaJson: {
    consecutiveFailRuns: number;
    consecutiveFailures: Record<string, number>;
    lastRunAt: Record<string, string>;
    max: string;
    telegram: string;
    google_calendar: string;
  };
  lastSuccessAt?: string | null;
  lastStatus?: string;
};

const mockOnConflictDoUpdate = vi.fn((_arg: { set: Record<string, unknown> }) => Promise.resolve());
const mockValues = vi.fn((_arg: ProbeRunValues) => ({
  onConflictDoUpdate: mockOnConflictDoUpdate,
}));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
  })),
}));

import { recordOperatorOutboundProbeRun } from './operatorHealthDrizzle.js';

function probeRunInput(
  overrides: Partial<{
    max: string;
    telegram: string;
    google_calendar: string;
  }> = {},
) {
  return {
    max: 'ok',
    telegram: 'skipped_not_configured',
    google_calendar: 'skipped_not_configured',
    ...overrides,
  };
}

describe('recordOperatorOutboundProbeRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it('increments the persisted channel failure counter on fail', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ metaJson: { consecutiveFailures: { max: 2 } } }]);
    const r = await recordOperatorOutboundProbeRun(probeRunInput({ max: 'fail' }));
    expect(r.consecutiveFailures.max).toBe(3);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const valuesArg = mockValues.mock.calls[0]![0];
    expect(valuesArg.metaJson.consecutiveFailures.max).toBe(3);
    expect(valuesArg.metaJson.telegram).toBe('skipped_not_configured');
    expect(valuesArg.metaJson.google_calendar).toBe('skipped_not_configured');
  });

  it('resets consecutiveFailRuns to 0 on success', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ metaJson: { consecutiveFailures: { max: 2 } } }]);
    const r = await recordOperatorOutboundProbeRun(probeRunInput());
    expect(r.consecutiveFailures.max).toBe(0);
    const valuesArg = mockValues.mock.calls[0]![0];
    expect(valuesArg.metaJson.consecutiveFailures.max).toBe(0);
    expect(valuesArg.lastSuccessAt).not.toBeNull();
  });

  it('starts streak at 1 when no previous row', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    const r = await recordOperatorOutboundProbeRun(probeRunInput({ max: 'fail' }));
    expect(r.consecutiveFailRuns).toBe(1);
  });

  it('on conflict fail path does not set lastSuccessAt in update set', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    await recordOperatorOutboundProbeRun(probeRunInput({ max: 'fail' }));
    const conflictArg = mockOnConflictDoUpdate.mock.calls[0]![0];
    expect(conflictArg.set).not.toHaveProperty('lastSuccessAt');
    expect(conflictArg.set.lastStatus).toBe('failure');
  });
});
