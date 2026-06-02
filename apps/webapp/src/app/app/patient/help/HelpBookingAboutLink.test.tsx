/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routePaths } from "@/app-layer/routes/paths";
import { HelpBookingAboutLink } from "./HelpBookingAboutLink";

describe("HelpBookingAboutLink", () => {
  it("links to patientAbout", () => {
    render(<HelpBookingAboutLink />);
    expect(screen.getByRole("link", { name: "О специалисте" })).toHaveAttribute(
      "href",
      routePaths.patientAbout,
    );
  });
});
