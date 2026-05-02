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
    delete: vi.fn(() => ({
      where: vi.fn(async () => {}),
    })),
  })),
}));

import { createPgCoursesPort } from "./pgCourses";

describe("createPgCoursesPort usage summary", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("getCourseUsageSummary aggregates instances by program_template_id and content_pages.linked_course_id", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          tpl_id: "11111111-1111-4111-8111-111111111111",
          tpl_title: "Шаблон",
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
    await port.getCourseUsageSummary("00000000-0000-4000-8000-000000000088");
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("FROM courses c");
    expect(sql).toContain("treatment_program_instances");
    expect(sql).toContain("content_pages");
    expect(sql).toContain("linked_course_id");
  });
});
