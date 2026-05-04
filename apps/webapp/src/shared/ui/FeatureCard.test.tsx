/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureCard } from "./FeatureCard";

describe("FeatureCard", () => {
  it("renders secondary link without nesting inside primary href", () => {
    render(
      <FeatureCard
        title="Материал"
        href="/app/patient/content/fixture-page"
        compact
        secondaryHref="/app/patient/courses?highlight=aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"
      />,
    );
    expect(screen.getByRole("link", { name: "Материал" })).toHaveAttribute("href", "/app/patient/content/fixture-page");
    expect(screen.getByRole("link", { name: "Открыть курс" })).toHaveAttribute(
      "href",
      "/app/patient/courses?highlight=aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
    );
  });

  it("renders non-interactive article when href is omitted", () => {
    render(
      <FeatureCard title="Скоро" description="Текст" status="coming-soon" containerId="card-soon" />,
    );
    expect(screen.getByRole("article")).toHaveAttribute("id", "card-soon");
    expect(screen.getByRole("heading", { level: 3, name: "Скоро" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("скоро")).toBeInTheDocument();
  });

  it("places containerId on Card root in secondaryHref branch", () => {
    const { container } = render(
      <FeatureCard
        title="Материал"
        href="/app/patient/content/a"
        secondaryHref="/app/patient/courses"
        containerId="card-dual"
      />,
    );
    const root = container.querySelector("#card-dual");
    expect(root).toBeTruthy();
    expect(root?.getAttribute("data-slot")).toBe("card");
  });

  it("renders locked card as article without link even when href is set", () => {
    render(
      <FeatureCard
        title="Закрыто"
        href="/app/patient/sections/x"
        status="locked"
        containerId="card-locked"
      />,
    );
    expect(screen.getByRole("article")).toHaveAttribute("id", "card-locked");
    expect(screen.getByRole("heading", { level: 3, name: "Закрыто" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Закрыто" })).toBeNull();
    expect(screen.getByText("заблокировано")).toBeInTheDocument();
  });

  it("renders single-link card with link wrapping card surface", () => {
    render(
      <FeatureCard title="Раздел" href="/app/patient/sections/warmups" compact containerId="card-one" />,
    );
    const link = screen.getByRole("link", { name: "Раздел" });
    expect(link).toHaveAttribute("href", "/app/patient/sections/warmups");
    expect(link).toHaveAttribute("id", "card-one");
    expect(link.querySelector('[data-slot="card"]')).toBeTruthy();
  });

  it("renders full card with status badge when not compact", () => {
    render(
      <FeatureCard
        title="Секция"
        description="Описание"
        href="/app/patient/sections/a"
        status="coming-soon"
      />,
    );
    expect(screen.getByRole("link", { name: /Секция/i })).toHaveAttribute("href", "/app/patient/sections/a");
    expect(screen.getByText("скоро")).toBeInTheDocument();
    expect(screen.getByText("Описание")).toBeInTheDocument();
  });
});
