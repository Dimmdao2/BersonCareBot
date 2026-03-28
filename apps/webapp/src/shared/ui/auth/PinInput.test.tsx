/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinInput } from "./PinInput";

describe("PinInput", () => {
  it("centers PIN row and form", () => {
    const { container } = render(
      <PinInput onSubmit={() => {}} onForgot={() => {}} forgotHidden submitLabel="OK" />,
    );
    const form = container.querySelector("form");
    expect(form?.className).toMatch(/items-center/);
    expect(form?.className).toMatch(/mx-auto/);
    const row = container.querySelector('[role="group"]');
    expect(row?.className).toMatch(/justify-center/);
  });

  it("renders custom submitLabel", () => {
    render(
      <PinInput
        onSubmit={() => {}}
        onForgot={() => {}}
        forgotHidden
        submitLabel="Сохранить PIN"
      />,
    );
    expect(screen.getByRole("button", { name: "Сохранить PIN" })).toBeInTheDocument();
  });
});
