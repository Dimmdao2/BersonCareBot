import { describe, expect, it } from "vitest";
import { patientHelpArticlePathIfHelpSection } from "./patientHelpArticlePath";

describe("patientHelpArticlePathIfHelpSection", () => {
  it("returns help URL for help section", () => {
    expect(patientHelpArticlePathIfHelpSection("help", "faq")).toBe("/app/patient/help/faq");
  });

  it("returns null for thematic section", () => {
    expect(patientHelpArticlePathIfHelpSection("antistress", "faq")).toBeNull();
  });
});
