import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());
const courseMutationState = vi.hoisted(() => ({ existingOrganizationId: null as string | null }));
const courseUpdateMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: async (fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              courseMutationState.existingOrganizationId
                ? [{ organizationId: courseMutationState.existingOrganizationId }]
                : [],
          }),
        }),
      }),
      update: () => {
        courseUpdateMock();
        return {
          set: () => ({
            where: () => ({
              returning: async () => [],
            }),
          }),
        };
      },
    }),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
          orderBy: vi.fn(async () => []),
        })),
        orderBy: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: 'x' }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: 'x' }]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {}),
    })),
  })),
}));

import { createPgCoursesPort } from './pgCourses';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('createPgCoursesPort principal constraints', () => {
  beforeEach(() => {
    courseMutationState.existingOrganizationId = null;
    courseUpdateMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue('org-a');
  });

  it('routes course writes through principal-aware mutation transactions', () => {
    const src = readFileSync(join(__dirname, 'pgCourses.ts'), 'utf8');
    expect(src).toContain('getCurrentDbPrincipalOrganizationId');
    expect(src).toContain('runDrizzleMutationTransaction');
    expect(src).toContain('organization_principal_required');
    expect(src).toContain('organization_principal_mismatch');
    expect(src).toContain('organizationId');
    expect(src).not.toContain('organizationReadCondition');
    expect(src).not.toContain('c.organization_id IS NULL');
    expect(src).toContain('eq(coursesTable.organizationId, currentPrincipalOrganizationId())');
    expect(src).toContain('requireCurrentOrganizationOwnership(template?.organizationId)');
    expect(src).toContain('requireCurrentOrganizationOwnership(page?.organizationId)');
    expect(src).toContain(
      '.where(and(eq(coursesTable.id, id), eq(coursesTable.organizationId, organizationId)))',
    );
    expect(src).not.toContain('organizationId: currentPrincipalOrganizationId(),');
    expect(src).not.toContain('organizationId,\n        updatedAt');
  });

  it('routes the usage query through the unified Drizzle chokepoint, not a raw pool', () => {
    const src = readFileSync(join(__dirname, 'pgCourses.ts'), 'utf8');
    expect(src).toContain('runWebappPgText');
    expect(src).not.toContain('runPgPoolPgText');
    expect(src).not.toContain('getPool');
  });

  it('leaves foreign and legacy NULL-owner rows neutral before UPDATE', async () => {
    const port = createPgCoursesPort();

    await expect(
      port.update('00000000-0000-4000-8000-000000000099', { title: 'Scoped' }),
    ).resolves.toBeNull();

    expect(courseUpdateMock).not.toHaveBeenCalled();
  });
});

describe('createPgCoursesPort usage summary', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue('org-a');
  });

  it('getCourseUsageSummary aggregates instances by program_template_id and content_pages.linked_course_id', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          tpl_id: '11111111-1111-4111-8111-111111111111',
          tpl_title: 'Шаблон',
          active_inst: 0,
          completed_inst: 0,
          pub_pages: 0,
          draft_pages: 0,
          arch_pages: 0,
          active_inst_refs: [],
          completed_inst_refs: [],
          pub_page_refs: [],
          draft_page_refs: [],
          arch_page_refs: [],
        },
      ],
    });
    const port = createPgCoursesPort();
    await port.getCourseUsageSummary('00000000-0000-4000-8000-000000000088');
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('FROM courses c');
    expect(sql).toContain('treatment_program_instances');
    expect(sql).toContain('content_pages');
    expect(sql).toContain('linked_course_id');
    expect(sql).toContain('i.organization_id = c.organization_id');
    expect(sql).toContain('p.organization_id = c.organization_id');
  });

  it('filters usage summary by current principal when present', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue('org-1');
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const port = createPgCoursesPort();
    await port.getCourseUsageSummary('00000000-0000-4000-8000-000000000088');

    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? '');
    const params = runWebappPgTextMock.mock.calls[0]?.[1];
    expect(sql).toContain('c.organization_id = $2::uuid');
    expect(params).toEqual(['00000000-0000-4000-8000-000000000088', 'org-1']);
  });

  it('fails closed before querying when no organization principal is present', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);
    const port = createPgCoursesPort();
    await expect(
      port.getCourseUsageSummary('00000000-0000-4000-8000-000000000088'),
    ).rejects.toThrow('organization_principal_required');
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });
});
