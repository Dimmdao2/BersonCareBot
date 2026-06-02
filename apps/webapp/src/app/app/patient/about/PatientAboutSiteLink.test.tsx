/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SPECIALIST_PUBLIC_SITE_HREF } from "@/modules/help-content/specialistPublicSite";
import { PatientAboutSiteLink } from "./PatientAboutSiteLink";

describe("PatientAboutSiteLink", () => {
  it("renders external link to specialist site", () => {
    render(<PatientAboutSiteLink />);
    const link = screen.getByRole("link", { name: "на моём сайте" });
    expect(link).toHaveAttribute("href", SPECIALIST_PUBLIC_SITE_HREF);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
