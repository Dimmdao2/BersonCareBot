/** Wave 3 phase 15C — treatment program raw SQL parity via `runWebappPgText`. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

const TPL_ID = "00000000-0000-4000-8000-000000000001";
const PREVIEW_MEDIA_ID = "11111111-1111-4111-8111-111111111111";

const tplListRow = {
  id: TPL_ID,
  title: "Программа",
  description: null,
  status: "published",
  createdBy: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

function makeSelectChain(orderByResult: unknown[] = [tplListRow]) {
  const chain: {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
  } = {
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
    groupBy: vi.fn(async () => []),
    orderBy: vi.fn(async () => orderByResult),
    limit: vi.fn(async () => []),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  return chain;
}

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (queryText: string, values?: readonly unknown[], db?: unknown) =>
    runWebappPgTextMock(queryText, values, db),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: vi.fn(() => ({
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: "x" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "x" }]),
        })),
      })),
    })),
    query: {
      treatmentProgramTemplates: { findFirst: vi.fn(async () => null) },
    },
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {}),
    })),
  })),
}));

import { createPgTreatmentProgramPort } from "./pgTreatmentProgram";

describe("createPgTreatmentProgramPort usage summary", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("getTreatmentProgramTemplateUsageSummary runs aggregate query for template_id and courses.program_template_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          active_inst: 0,
          completed_inst: 0,
          pub_courses: 0,
          draft_courses: 0,
          arch_courses: 0,
          active_inst_refs: [],
          completed_inst_refs: [],
          pub_course_refs: [],
          draft_course_refs: [],
          arch_course_refs: [],
        },
      ],
    });
    const port = createPgTreatmentProgramPort();
    await port.getTreatmentProgramTemplateUsageSummary("00000000-0000-4000-8000-000000000099");
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("treatment_program_instances");
    expect(sql).toContain("template_id = $1::uuid");
    expect(sql).toContain("courses");
    expect(sql).toContain("program_template_id = $1::uuid");
  });

  it("maps counts and jsonb refs from usage summary row", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          active_inst: 2,
          completed_inst: 1,
          pub_courses: 1,
          draft_courses: 0,
          arch_courses: 0,
          active_inst_refs: [
            {
              kind: "treatment_program_instance",
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              title: "Программа",
              patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            },
          ],
          completed_inst_refs: [],
          pub_course_refs: [{ kind: "course", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Курс" }],
          draft_course_refs: [],
          arch_course_refs: [],
        },
      ],
    });
    const port = createPgTreatmentProgramPort();
    const u = await port.getTreatmentProgramTemplateUsageSummary("00000000-0000-4000-8000-000000000099");
    expect(u.activeTreatmentProgramInstanceCount).toBe(2);
    expect(u.completedTreatmentProgramInstanceCount).toBe(1);
    expect(u.publishedCourseCount).toBe(1);
    expect(u.activeTreatmentProgramInstanceRefs[0]).toMatchObject({
      kind: "treatment_program_instance",
      patientUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(u.publishedCourseRefs[0]).toMatchObject({ kind: "course", title: "Курс" });
  });
});

describe("createPgTreatmentProgramPort listTemplates preview SQL", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("listTemplates runs first-item preview CTE and media_files enrichment", async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({
        rows: [
          {
            template_id: TPL_ID,
            preview_url: `/api/media/${PREVIEW_MEDIA_ID}`,
            preview_type: "image",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: PREVIEW_MEDIA_ID,
            preview_sm_key: "previews/sm.jpg",
            preview_status: "ready",
          },
        ],
      });
    const port = createPgTreatmentProgramPort();
    const list = await port.listTemplates({ includeArchived: false });
    expect(list).toHaveLength(1);
    expect(list[0]?.listPreviewMedia).toMatchObject({
      mediaUrl: `/api/media/${PREVIEW_MEDIA_ID}`,
      mediaType: "image",
      previewSmUrl: `/api/media/${PREVIEW_MEDIA_ID}/preview/sm`,
      previewStatus: "ready",
    });
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    const sqls = runWebappPgTextMock.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toContain("WITH first_item AS");
    expect(sqls[0]).toContain("treatment_program_template_stage_items");
    expect(sqls[1]).toContain("FROM media_files");
    expect(sqls[1]).toContain("ANY($1::uuid[])");
  });
});
