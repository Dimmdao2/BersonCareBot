import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPublicInPersonSlotContextForSlugRscMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

vi.mock("@/app/app/patient/booking/new/slot/SlotStepClient", () => ({
  SlotStepClient: () => null,
}));

vi.mock("../../publicOrganizationBooking", () => ({
  loadPublicInPersonSlotContextForSlugRsc: loadPublicInPersonSlotContextForSlugRscMock,
}));

import PublicBookSlotPage from "./page";

describe("PublicBookSlotPage backHref", () => {
  const context = {
    ok: true as const,
    branchId: "branch-a",
    serviceId: "service-a",
    cityCode: "moscow",
    cityTitle: "Москва",
    serviceTitle: "Каноническая услуга",
    durationMinutes: 75,
    priceMinor: 120000,
    maxConsecutiveSlotHours: 2,
    appDisplayTimeZone: "Europe/Moscow",
  };

  beforeEach(() => {
    loadPublicInPersonSlotContextForSlugRscMock.mockResolvedValue(context);
  });

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
    const child = (element as { props: { children: { props: { orgSlug?: string } } } }).props.children;
    expect(backHref).toContain("/book/service?");
    expect(backHref).toContain(`orgSlug=${encodeURIComponent("saas-test-clinic-a")}`);
    expect(child.props.orgSlug).toBe("saas-test-clinic-a");
  });

  it("uses server-derived display metadata, never query labels, for the slot-to-confirm handoff", async () => {
    const element = await PublicBookSlotPage({
      searchParams: Promise.resolve({
        type: "in_person",
        branchId: "branch-a",
        serviceId: "service-a",
        cityCode: "forged-city",
        cityTitle: "Forged city",
        serviceTitle: "Forged service",
        durationMinutes: "1",
        orgSlug: "clinic-a",
      }),
    });
    const child = (element as { props: { children: { props: Record<string, unknown> } } }).props.children;
    expect(loadPublicInPersonSlotContextForSlugRscMock).toHaveBeenCalledWith({
      orgSlug: "clinic-a",
      branchId: "branch-a",
      serviceId: "service-a",
    });
    expect(child.props).toMatchObject({
      cityCode: "moscow",
      cityTitle: "Москва",
      serviceTitle: "Каноническая услуга",
      durationMinutes: 75,
      orgSlug: "clinic-a",
    });
  });
});
