import { describe, expect, it } from "vitest";
import { buildPublicBookingWidgetOutputs } from "./adminWidgetUrls";

describe("admin public-booking widget outputs", () => {
  it("carries the complete canonical selection through link, iframe, and both JS variants", () => {
    const outputs = buildPublicBookingWidgetOutputs("https://clinic.example", {
      orgSlug: "clinic-a",
      branchId: "550e8400-e29b-41d4-a716-446655440001",
      serviceId: "550e8400-e29b-41d4-a716-446655440002",
      utmSource: "partner",
    });

    for (const output of Object.values(outputs)) {
      expect(output).toContain("orgSlug=clinic-a");
      expect(output).toContain("branchId=550e8400-e29b-41d4-a716-446655440001");
      expect(output).toContain("serviceId=550e8400-e29b-41d4-a716-446655440002");
    }
    expect(outputs.pageUrl).toBe(
      "https://clinic.example/book?orgSlug=clinic-a&branchId=550e8400-e29b-41d4-a716-446655440001&serviceId=550e8400-e29b-41d4-a716-446655440002&utm_source=partner",
    );
    expect(outputs.iframeSnippet).toContain("embed=iframe");
    expect(outputs.scriptSnippet).toContain('data-mode="iframe"');
    expect(outputs.popupSnippet).toContain('data-mode="popup"');
  });
});
