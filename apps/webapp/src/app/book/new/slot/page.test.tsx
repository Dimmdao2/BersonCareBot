import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

vi.mock("@/app/app/patient/booking/new/slot/SlotStepClient", () => ({
  SlotStepClient: () => null,
}));

import PublicBookSlotPage from "./page";

describe("PublicBookSlotPage backHref", () => {
  it("threads orgSlug into the back link to the service step (public /book/{slug} entry)", async () => {
    const element = await PublicBookSlotPage({
      searchParams: Promise.resolve({
        type: "in_person",
        branchId: "branch-a",
        serviceId: "service-a",
        cityCode: "moscow",
        cityTitle: "Москва",
        orgSlug: "saas-test-clinic-a",
      }),
    });

    const backHref = (element as { props: { backHref: string } }).props.backHref;
    expect(backHref).toContain("/book/service?");
    expect(backHref).toContain(`orgSlug=${encodeURIComponent("saas-test-clinic-a")}`);
  });

  it("omits orgSlug from the back link on the generic /book entry", async () => {
    const element = await PublicBookSlotPage({
      searchParams: Promise.resolve({
        type: "in_person",
        branchId: "branch-a",
        serviceId: "service-a",
        cityCode: "moscow",
        cityTitle: "Москва",
      }),
    });

    const backHref = (element as { props: { backHref: string } }).props.backHref;
    expect(backHref).not.toContain("orgSlug=");
  });
});
