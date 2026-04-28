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
});
