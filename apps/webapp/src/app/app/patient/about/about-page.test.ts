import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { routePaths } from "@/app-layer/routes/paths";
import { SPECIALIST_PUBLIC_SITE_HREF } from "@/modules/help-content/specialistPublicSite";

const pagePath = join(import.meta.dirname, "page.tsx");

describe("patient/about page (contract)", () => {
  it("uses PatientAppShell with back to help and PatientAboutSiteLink", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("PatientAppShell");
    expect(src).toContain("PatientAboutSiteLink");
    expect(src).toContain("routePaths.patientHelp");
    expect(src).toContain('title="О специалисте"');
  });

  it("registers patientAbout in routePaths", () => {
    expect(routePaths.patientAbout).toBe("/app/patient/about");
    expect(SPECIALIST_PUBLIC_SITE_HREF).toBe("https://dmitryberson.ru");
  });
});
