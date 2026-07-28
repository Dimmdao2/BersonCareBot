import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgDoctorProactiveInsightsPort } from './pgDoctorProactiveInsights';

const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '20000000-0000-4000-8000-000000000002';

describe('pgDoctorProactiveInsights repo', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('queryInsights returns empty when no on-support patients', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorProactiveInsightsPort();
    const result = await port.queryInsights({
      limit: 5,
      displayIana: 'Europe/Moscow',
      organizationId: ORG_A,
    });

    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain('doctor_patient_support');
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([ORG_A]);
  });

  it('queryInsights applies one required organization to support, wellbeing, program and action SQL', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: 'p1', display_name: 'One' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ patient_user_id: 'p1', instance_id: 'instance-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorProactiveInsightsPort();
    const result = await port.queryInsights({
      limit: 10,
      displayIana: 'Europe/Moscow',
      organizationId: ORG_B,
    });

    expect(result.totalCount).toBe(1);
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(4);
    expect(String(runWebappPgTextMock.mock.calls[0]?.[0])).toContain('doctor_patient_support');
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain('symptom_entries');
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0])).toContain('treatment_program_instances');
    expect(String(runWebappPgTextMock.mock.calls[3]?.[0])).toContain('program_action_log');
    for (const call of runWebappPgTextMock.mock.calls) {
      expect(String(call[0])).not.toMatch(/IS NULL OR [a-z]+\.organization_id/);
      expect(call[1]).toContain(ORG_B);
    }
  });

  it('filters configurable kinds before calculating the Today total', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ id: 'p1', display_name: 'One' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ patient_user_id: 'p1', instance_id: 'instance-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await createPgDoctorProactiveInsightsPort().queryInsights({
      limit: 10,
      displayIana: 'Europe/Moscow',
      organizationId: ORG_A,
      kinds: ['wellbeing_low_streak'],
    });

    expect(result).toEqual({ items: [], totalCount: 0 });
  });

  it('listForPatient queries single patient support ref then wellbeing/program SQL', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [{ id: 'p1', display_name: 'Patient One' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const port = createPgDoctorProactiveInsightsPort();
    const items = await port.listForPatient({
      patientUserId: 'p1',
      displayIana: 'Europe/Moscow',
      organizationId: ORG_A,
    });

    expect(Array.isArray(items)).toBe(true);
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(['p1', ORG_A]);
    expect(String(runWebappPgTextMock.mock.calls[1]?.[0])).toContain('symptom_entries');
    expect(String(runWebappPgTextMock.mock.calls[2]?.[0])).toContain('treatment_program_instances');
  });
});
