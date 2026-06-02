import { describe, expect, it } from "vitest";
import { contentPageRoleForSection, isContentPageRole } from "./content-page-roles";

describe("content-page-roles", () => {
  it("isContentPageRole accepts known roles", () => {
    expect(isContentPageRole("help_article")).toBe(true);
    expect(isContentPageRole("thematic_article")).toBe(true);
    expect(isContentPageRole("unknown")).toBe(false);
  });

  it("contentPageRoleForSection maps help section to help_article", () => {
    expect(contentPageRoleForSection("help", "article", null)).toBe("help_article");
    expect(contentPageRoleForSection("antistress", "article", null)).toBe("thematic_article");
    expect(contentPageRoleForSection("warmups", "system", "warmups")).toBe("system_cluster_page");
  });
});
