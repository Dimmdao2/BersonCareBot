/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileAccordionSection } from "./ProfileAccordionSection";

describe("ProfileAccordionSection", () => {
  it("starts collapsed and expands on trigger click", async () => {
    const user = userEvent.setup();
    render(
      <ProfileAccordionSection id="test-section" title="Личные данные">
        <p>Секретное содержимое</p>
      </ProfileAccordionSection>,
    );

    const trigger = screen.getByRole("button", { name: /Личные данные/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Секретное содержимое")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Секретное содержимое")).toBeInTheDocument();
  });

  it("respects defaultOpen", () => {
    render(
      <ProfileAccordionSection title="PIN для входа" defaultOpen>
        <p>Видно сразу</p>
      </ProfileAccordionSection>,
    );
    const trigger = screen.getByRole("button", { name: /PIN для входа/i });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Видно сразу")).toBeInTheDocument();
  });

  it("renders statusIcon inside trigger and stable id on root", () => {
    const { container } = render(
      <ProfileAccordionSection id="patient-profile-pin" title="PIN" statusIcon={<span data-testid="pin-icon">icon</span>}>
        <span>body</span>
      </ProfileAccordionSection>,
    );
    expect(container.querySelector("#patient-profile-pin")).toBeTruthy();
    expect(screen.getByTestId("pin-icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PIN/i }).contains(screen.getByTestId("pin-icon"))).toBe(true);
  });
});
