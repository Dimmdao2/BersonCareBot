/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { sortPatientContentSectionsForHome } from "./PatientHomeToday";
import type { ContentSectionRow } from "@/infra/repos/pgContentSections";

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

describe("sortPatientContentSectionsForHome", () => {
  it("orders by sortOrder then title", () => {
    const rows: ContentSectionRow[] = [
      { id: "2", slug: "b", title: "B", description: "", sortOrder: 2, isVisible: true, requiresAuth: false },
      { id: "1", slug: "a", title: "A", description: "", sortOrder: 1, isVisible: true, requiresAuth: false },
    ];
    const sorted = sortPatientContentSectionsForHome(rows);
    expect(sorted.map((r) => r.slug)).toEqual(["a", "b"]);
  });
});
