import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn(() => ({ query: queryMock, connect: vi.fn() })));
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
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

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("createPgCoursesPort principal constraints", () => {
  it("routes course writes through principal-aware mutation transactions", () => {
    const src = readFileSync(join(__dirname, "pgCourses.ts"), "utf8");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organizationId");
  });
});

describe("createPgCoursesPort usage summary", () => {
  beforeEach(() => {
    queryMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);
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

  it("filters usage summary by current principal when present", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue("org-1");
    queryMock.mockResolvedValueOnce({ rows: [] });

    const port = createPgCoursesPort();
    await port.getCourseUsageSummary("00000000-0000-4000-8000-000000000088");

    const sql = String(queryMock.mock.calls[0]?.[0] ?? "");
    const params = queryMock.mock.calls[0]?.[1];
    expect(sql).toContain("c.organization_id");
    expect(params).toEqual(["00000000-0000-4000-8000-000000000088", "org-1"]);
  });
});
