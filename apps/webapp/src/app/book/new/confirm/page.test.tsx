import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

vi.mock("./PublicConfirmStepClient", () => ({
  PublicConfirmStepClient: () => null,
}));

import PublicBookConfirmPage from "./page";

describe("PublicBookConfirmPage organization continuity", () => {
  it("passes orgSlug to create confirmation and back to the slot step", async () => {
    const element = await PublicBookConfirmPage({
      searchParams: Promise.resolve({
        type: "in_person",
        branchId: "550e8400-e29b-41d4-a716-446655440001",
        serviceId: "550e8400-e29b-41d4-a716-446655440002",
        cityCode: "online",
        cityTitle: "Онлайн",
        serviceTitle: "Консультация",
        date: "2026-07-20",
        slot: "2026-07-20T10:00:00.000Z",
        slotEnd: "2026-07-20T11:00:00.000Z",
        orgSlug: "clinic-a",
      }),
    });

    const shell = element as {
      props: { backHref: string; children: { props: { orgSlug?: string } } };
    };
    expect(shell.props.backHref).toContain("orgSlug=clinic-a");
    expect(shell.props.children.props.orgSlug).toBe("clinic-a");
  });
});
