import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  inMemoryContentPagesPort,
  resetInMemoryContentPagesStoreForTests,
} from "@/infra/repos/pgContentPages";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPgContentPagesSource(): string {
  return readFileSync(join(__dirname, "pgContentPages.ts"), "utf8");
}

function methodSource(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("pgContentPages (runtime constraints)", () => {
  it("runs lifecycle updates through a Drizzle transaction", () => {
    const method = methodSource(
      readPgContentPagesSource(),
      "    async updateLifecycle(id, patch)",
      "    async reorderInSection(section, orderedIds)",
    );
    expect(method).toContain("runDrizzleMutationTransaction");
    expect(method).toContain("tx.update(contentPages)");
  });

  it("runs page upserts through a Drizzle transaction and stamps current principal org", () => {
    const method = methodSource(
      readPgContentPagesSource(),
      "    async upsert(page)",
      "    async updateFull(id, page)",
    );
    expect(method).toContain("currentPrincipalOrganizationId()");
    expect(method).toContain("runDrizzleMutationTransaction");
    expect(method).toContain("organizationId");
    expect(method).toContain("organizationId,");
  });

  it("runs full page updates through a Drizzle transaction and does not clear org without principal", () => {
    const method = methodSource(
      readPgContentPagesSource(),
      "    async updateFull(id, page)",
      "    async updateLifecycle(id, patch)",
    );
    expect(method).toContain("currentPrincipalOrganizationId()");
    expect(method).toContain("runDrizzleMutationTransaction");
    expect(method).toContain(".update(contentPages)");
    expect(method).toContain("organizationId,");
    expect(method).not.toMatch(/organizationId:\s*null/);
  });
});

describe("inMemoryContentPagesPort (linked_course_id)", () => {
  beforeEach(() => {
    resetInMemoryContentPagesStoreForTests();
  });

  it("upserts and returns linkedCourseId via getById", async () => {
    const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const id = await inMemoryContentPagesPort.upsert({
      section: "lessons",
      slug: "promo",
      title: "Promo",
      summary: "",
      bodyMd: "# x",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: courseId,
    });
    const row = await inMemoryContentPagesPort.getById(id);
    expect(row?.linkedCourseId).toBe(courseId);
  });

  it("clears linkedCourseId on upsert when null", async () => {
    const courseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await inMemoryContentPagesPort.upsert({
      section: "lessons",
      slug: "p2",
      title: "A",
      summary: "",
      bodyMd: "",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: courseId,
    });
    await inMemoryContentPagesPort.upsert({
      section: "lessons",
      slug: "p2",
      title: "A",
      summary: "",
      bodyMd: "",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: null,
    });
    const row = await inMemoryContentPagesPort.getBySlug("p2");
    expect(row?.linkedCourseId).toBeNull();
  });

  it("updateFull changes section without duplicating row", async () => {
    const id = await inMemoryContentPagesPort.upsert({
      section: "a",
      slug: "shared-slug",
      title: "T",
      summary: "",
      bodyMd: "x",
      bodyHtml: "",
      sortOrder: 1,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: null,
    });
    await inMemoryContentPagesPort.updateFull(id, {
      section: "b",
      slug: "shared-slug",
      title: "T2",
      summary: "",
      bodyMd: "y",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: null,
    });
    const all = await inMemoryContentPagesPort.listAll();
    expect(all.filter((p) => p.slug === "shared-slug")).toHaveLength(1);
    const row = await inMemoryContentPagesPort.getById(id);
    expect(row?.section).toBe("b");
    expect(row?.bodyMd).toBe("y");
  });

  it("listMetaByIds returns title and slug for existing pages", async () => {
    const id = await inMemoryContentPagesPort.upsert({
      section: "lessons",
      slug: "meta-page",
      title: "Meta title",
      summary: "",
      bodyMd: "x",
      bodyHtml: "",
      sortOrder: 0,
      isPublished: true,
      requiresAuth: false,
      videoUrl: null,
      videoType: null,
      imageUrl: null,
      linkedCourseId: null,
    });
    const meta = await inMemoryContentPagesPort.listMetaByIds([
      id,
      "00000000-0000-4000-8000-000000000099",
    ]);
    expect(meta).toEqual([{ id, title: "Meta title", slug: "meta-page" }]);
  });
});
