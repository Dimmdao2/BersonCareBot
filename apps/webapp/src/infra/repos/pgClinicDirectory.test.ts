import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: vi.fn() }));
vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: vi.fn(),
}));

import { createPgClinicDirectoryPort } from "./pgClinicDirectory";

describe("pgClinicDirectory public slug resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls only the narrow bootstrap function with the given slug", async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [{ organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    });
    const port = createPgClinicDirectoryPort();

    await expect(port.resolveOrganizationIdBySlug("clinic-a")).resolves.toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );

    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining("app.resolve_public_organization_by_slug"),
      ["clinic-a"],
    );
  });

  it("preserves fail-closed null from the database resolver (unknown/unpublished/inactive slug)", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ organization_id: null }] });
    const port = createPgClinicDirectoryPort();
    await expect(port.resolveOrganizationIdBySlug("does-not-exist")).resolves.toBeNull();
  });

  it("returns null when the resolver yields no row at all", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
    const port = createPgClinicDirectoryPort();
    await expect(port.resolveOrganizationIdBySlug("clinic-a")).resolves.toBeNull();
  });
});
