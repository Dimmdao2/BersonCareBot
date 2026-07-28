import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappSqlMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => ({}),
  runWebappSql: runWebappSqlMock,
}));

import { pgMediaUsageSummaryForMediaId } from './pgMediaUsageSummary';

const MEDIA_ID = '10000000-0000-4000-8000-000000000001';

describe('pgMediaUsageSummaryForMediaId', () => {
  beforeEach(() => {
    runWebappSqlMock.mockReset();
  });

  it('counts only catalog exercises and keeps personal instance media outside generic usage', async () => {
    runWebappSqlMock.mockResolvedValue({
      rows: [
        {
          materials: '0',
          exercises: '1',
          clinical_tests: '0',
          recommendations: '0',
          sections: '0',
        },
      ],
    });

    const summary = await pgMediaUsageSummaryForMediaId(MEDIA_ID);
    const fragment = runWebappSqlMock.mock.calls[0]?.[1];
    expect(fragment).toBeDefined();
    const compiled = new PgDialect().sqlToQuery(fragment);

    expect(compiled.sql).toMatch(
      /INNER JOIN lfk_exercises e\s+ON e\.id = em\.exercise_id\s+AND e\.is_archived = false\s+AND e\.catalog_scope = 'catalog'/,
    );
    expect(compiled.params).toContain(`/api/media/${MEDIA_ID}`);
    expect(summary.exercises).toBe(1);
  });
});
