import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, connect: vi.fn() })));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

vi.mock("@/app-layer/db/drizzle", () => ({
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
    queryMock.mockReset();
  });

  it("getTreatmentProgramTemplateUsageSummary runs aggregate query for template_id and courses.program_template_id", async () => {
    queryMock.mockResolvedValueOnce({
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
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("treatment_program_instances");
    expect(sql).toContain("template_id = $1::uuid");
    expect(sql).toContain("courses");
    expect(sql).toContain("program_template_id = $1::uuid");
  });

  it("maps counts and jsonb refs from pool row", async () => {
    queryMock.mockResolvedValueOnce({
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
