import { describe, expect, it } from "vitest";
import { computeCompatSyncQuality } from "./compatSyncQuality";

describe("computeCompatSyncQuality", () => {
  it("returns full only with resolved branch_service_id, city, service title, and slot end", () => {
    expect(
      computeCompatSyncQuality({
        branchServiceId: "bs-1",
        cityCodeSnapshot: "moscow",
        serviceTitleSnapshot: "Сеанс",
        branchTitleSnapshot: "Филиал",
        rubitimeBranchId: "1",
        rubitimeServiceId: "2",
        slotEndExplicitFromWebhook: true,
        slotEndFromCatalogDuration: false,
      }),
    ).toBe("full");

    expect(
      computeCompatSyncQuality({
        branchServiceId: "bs-1",
        cityCodeSnapshot: "moscow",
        serviceTitleSnapshot: "Сеанс",
        branchTitleSnapshot: "Филиал",
        rubitimeBranchId: "1",
        rubitimeServiceId: "2",
        slotEndExplicitFromWebhook: false,
        slotEndFromCatalogDuration: true,
      }),
    ).toBe("full");
  });

  it("does not declare full without real branch_service_id (no fake full)", () => {
    expect(
      computeCompatSyncQuality({
        branchServiceId: null,
        cityCodeSnapshot: "moscow",
        serviceTitleSnapshot: "Сеанс",
        branchTitleSnapshot: "Филиал",
        rubitimeBranchId: "1",
        rubitimeServiceId: "2",
        slotEndExplicitFromWebhook: true,
        slotEndFromCatalogDuration: false,
      }),
    ).toBe("partial");
  });

  it("classifies lookup miss as partial when titles exist", () => {
    expect(
      computeCompatSyncQuality({
        branchServiceId: null,
        cityCodeSnapshot: null,
        serviceTitleSnapshot: "ЛФК",
        branchTitleSnapshot: "Клиника",
        rubitimeBranchId: "1",
        rubitimeServiceId: "2",
        slotEndExplicitFromWebhook: true,
        slotEndFromCatalogDuration: false,
      }),
    ).toBe("partial");
  });

  it("minimal when only rubitime ids without title-like fields", () => {
    expect(
      computeCompatSyncQuality({
        branchServiceId: null,
        cityCodeSnapshot: null,
        serviceTitleSnapshot: null,
        branchTitleSnapshot: null,
        rubitimeBranchId: "1",
        rubitimeServiceId: "2",
        slotEndExplicitFromWebhook: false,
        slotEndFromCatalogDuration: false,
      }),
    ).toBe("minimal");
  });
});
