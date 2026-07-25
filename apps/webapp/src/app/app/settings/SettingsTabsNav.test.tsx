/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsTabsNav } from "./SettingsTabsNav";

describe("SettingsTabsNav", () => {
  it("renders nothing when the viewer can only reach a single section", () => {
    const { container } = render(<SettingsTabsNav activeTab="organization" visibleTabs={["organization"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the sections the viewer may access, in canonical order", () => {
    render(<SettingsTabsNav activeTab="organization" visibleTabs={["organization", "billing"]} />);

    expect(screen.getByRole("link", { name: "Клиника" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Тариф и биллинг" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Команда" })).not.toBeInTheDocument();
  });

  it("never renders a link to a section outside visibleTabs, even when it is the active tab", () => {
    // Defensive: activeTab absent from visibleTabs should not force-render a dead link.
    render(<SettingsTabsNav activeTab="billing" visibleTabs={["organization"]} />);
    expect(screen.queryByRole("link", { name: "Тариф и биллинг" })).not.toBeInTheDocument();
  });

  it("marks the active tab with aria-current and links each tab to its canonical ?tab= URL", () => {
    render(<SettingsTabsNav activeTab="team" visibleTabs={["organization", "team", "billing"]} />);

    const teamLink = screen.getByRole("link", { name: "Команда" });
    expect(teamLink).toHaveAttribute("aria-current", "page");
    expect(teamLink).toHaveAttribute("href", "/app/settings?tab=team");

    const orgLink = screen.getByRole("link", { name: "Клиника" });
    expect(orgLink).not.toHaveAttribute("aria-current");
    expect(orgLink).toHaveAttribute("href", "/app/settings?tab=organization");
  });
});
