import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelectLimit = vi.fn();
const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

type ProbeRunValues = {
  metaJson: {
    consecutiveFailRuns: number;
    max: string;
    rubitime: string;
    telegram: string;
    google_calendar: string;
  };
  lastSuccessAt?: string | null;
  lastStatus?: string;
};

const mockOnConflictDoUpdate = vi.fn((_arg: { set: Record<string, unknown> }) => Promise.resolve());
const mockValues = vi.fn((_arg: ProbeRunValues) => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
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
    rubitime: string;
    telegram: string;
    google_calendar: string;
    anyFail: boolean;
  }> = {},
) {
  return {
    max: 'ok',
    rubitime: 'ok',
    telegram: 'skipped_not_configured',
    google_calendar: 'skipped_not_configured',
    anyFail: false,
    ...overrides,
  };
}

describe('recordOperatorOutboundProbeRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it('increments consecutiveFailRuns from previous meta on fail', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ metaJson: { consecutiveFailRuns: 2 } }]);
    const r = await recordOperatorOutboundProbeRun(probeRunInput({ max: 'fail', anyFail: true }));
    expect(r.consecutiveFailRuns).toBe(3);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    const valuesArg = mockValues.mock.calls[0]![0];
    expect(valuesArg.metaJson.consecutiveFailRuns).toBe(3);
    expect(valuesArg.metaJson.telegram).toBe('skipped_not_configured');
    expect(valuesArg.metaJson.google_calendar).toBe('skipped_not_configured');
  });

  it('resets consecutiveFailRuns to 0 on success', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ metaJson: { consecutiveFailRuns: 2 } }]);
    const r = await recordOperatorOutboundProbeRun(probeRunInput());
    expect(r.consecutiveFailRuns).toBe(0);
    const valuesArg = mockValues.mock.calls[0]![0];
    expect(valuesArg.metaJson.consecutiveFailRuns).toBe(0);
    expect(valuesArg.lastSuccessAt).not.toBeNull();
  });

  it('starts streak at 1 when no previous row', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    const r = await recordOperatorOutboundProbeRun(
      probeRunInput({ max: 'fail', rubitime: 'skipped_not_configured', anyFail: true }),
    );
    expect(r.consecutiveFailRuns).toBe(1);
  });

  it('on conflict fail path does not set lastSuccessAt in update set', async () => {
    mockSelectLimit.mockResolvedValueOnce([]);
    await recordOperatorOutboundProbeRun(probeRunInput({ max: 'fail', anyFail: true }));
    const conflictArg = mockOnConflictDoUpdate.mock.calls[0]![0];
    expect(conflictArg.set).not.toHaveProperty('lastSuccessAt');
    expect(conflictArg.set.lastStatus).toBe('failure');
  });
});
