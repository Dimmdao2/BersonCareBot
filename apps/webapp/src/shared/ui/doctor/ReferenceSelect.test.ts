// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReferenceSelect } from "./ReferenceSelect";

describe("ReferenceSelect", () => {
  it("exports a client component function", () => {
    expect(typeof ReferenceSelect).toBe("function");
  });

  it("can show all static options on focus even when a value is selected", () => {
    render(
      createElement(ReferenceSelect, {
        prefetchedItems: [
          { id: "status-active", code: "active", title: "Активные", sortOrder: 1 },
          { id: "status-all", code: "all", title: "Все", sortOrder: 2 },
          { id: "status-archived", code: "archived", title: "Архив", sortOrder: 3 },
        ],
        valueMatch: "code",
        submitField: "code",
        value: "active",
        onChange: () => {},
        showAllOnFocus: true,
      }),
    );

    fireEvent.focus(screen.getByRole("combobox"));

    expect(screen.getByText("Все")).toBeTruthy();
    expect(screen.getByText("Архив")).toBeTruthy();
  });
});
