/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CabinetInfoLinksCard } from "./CabinetInfoLinksCard";

describe("CabinetInfoLinksCard", () => {
  it("always renders the useful links block with base tiles", () => {
    render(
      <CabinetInfoLinksCard
        tiles={[
          { href: "/app/patient/address", label: "Адрес кабинета" },
          { href: "/app/patient/help", label: "Справка и контакты" },
        ]}
      />,
    );
    expect(screen.getByTestId("cabinet-info-links")).toBeInTheDocument();
    expect(screen.getByText("Полезная информация")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Адрес кабинета" })).toHaveAttribute("href", "/app/patient/address");
    expect(screen.queryByRole("link", { name: "Как подготовиться" })).not.toBeInTheDocument();
  });

  it("shows preparation and pricing links when provided in tiles", () => {
    render(
      <CabinetInfoLinksCard
        tiles={[
          { href: "/app/patient/address", label: "Адрес кабинета" },
          { href: "/app/patient/help/preparation", label: "Как подготовиться" },
          { href: "/app/patient/help/services-pricing", label: "Стоимость" },
          { href: "/app/patient/help", label: "Справка и контакты" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Как подготовиться" })).toHaveAttribute(
      "href",
      "/app/patient/help/preparation",
    );
    expect(screen.getByRole("link", { name: "Стоимость" })).toHaveAttribute(
      "href",
      "/app/patient/help/services-pricing",
    );
  });

  it("renders booking surface tiles without Записаться link", () => {
    render(
      <CabinetInfoLinksCard
        tiles={[
          { href: "/app/patient/address", label: "Адрес кабинета" },
          { href: "/app/patient/help/about", label: "О специалисте" },
          { href: "/app/patient/help", label: "Справка и контакты" },
        ]}
      />,
    );
    expect(screen.queryByRole("link", { name: "Записаться" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "О специалисте" })).toBeInTheDocument();
  });
});
