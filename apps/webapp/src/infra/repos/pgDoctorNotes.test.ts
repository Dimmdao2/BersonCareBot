import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runDrizzleMutationTransactionMock = vi.hoisted(() => vi.fn());
const returningMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

vi.mock("@/infra/db/drizzleMutationTx", () => ({
  runDrizzleMutationTransaction: runDrizzleMutationTransactionMock,
}));

vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: () => "org-1",
}));

import { createPgDoctorNotesPort } from "./pgDoctorNotes";

describe("pgDoctorNotes", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runDrizzleMutationTransactionMock.mockReset();
    returningMock.mockReset();
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        insert: () => ({
          values: () => ({
            returning: returningMock,
          }),
        }),
      }),
    );
  });

  it("listForUser queries doctor_notes ordered by created_at desc", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgDoctorNotesPort();
    await port.listForUser("user-1");

    expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("doctor_notes");
    expect(sql).toContain("organization_id = $2::uuid");
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["user-1", "org-1"]);
  });

  it("create inserts note and returns mapped row", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          id: "n1",
          organizationId: "org-1",
          userId: "u1",
          authorId: "a1",
          text: "note",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    returningMock.mockResolvedValueOnce([
      {
        id: "n1",
        organizationId: "org-1",
        userId: "u1",
        authorId: "a1",
        text: "note",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const port = createPgDoctorNotesPort();
    const row = await port.create({ userId: "u1", authorId: "a1", text: "note" });

    expect(row.id).toBe("n1");
    expect(runDrizzleMutationTransactionMock).toHaveBeenCalledTimes(1);
    expect(returningMock).toHaveBeenCalledTimes(1);
  });
});
