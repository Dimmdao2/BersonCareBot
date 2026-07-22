import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: vi.fn() }));
vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: vi.fn(),
}));
vi.mock("@/modules/booking-scheduling/service", () => ({
  buildSlotsForContext: vi.fn(),
}));

import { createPgBookingSchedulingPort } from "./pgBookingScheduling";

describe("pgBookingScheduling public tenant resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls only the narrow bootstrap function for canonical ids", async () => {
    runWebappPgTextMock.mockResolvedValue({
      rows: [{ organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    });
    const port = createPgBookingSchedulingPort();

    await expect(
      port.resolvePublicBookingOrganization({
        branchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      }),
    ).resolves.toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining("app.resolve_public_booking_organization"),
      [
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        null,
      ],
    );
  });

  it("rejects a retired legacy-only key without forwarding it to the database resolver", async () => {
    runWebappPgTextMock.mockResolvedValue({ rows: [{ organization_id: null }] });
    const port = createPgBookingSchedulingPort();
    await expect(
      port.resolvePublicBookingOrganization({
        branchServiceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      } as never),
    ).resolves.toBeNull();

    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining("app.resolve_public_booking_organization"),
      [null, null, null],
    );
  });
});
