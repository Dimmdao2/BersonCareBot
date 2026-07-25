// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReferenceSelect } from "./ReferenceSelect";

vi.mock("@/modules/references/referenceCache", () => ({
  loadReferenceItems: vi.fn(() => Promise.resolve([])),
}));

describe("ReferenceSelect", () => {
  it("leaves the field enabled (not stuck on \"Загрузка…\") when the load rejects", async () => {
    const { loadReferenceItems } = await import("@/modules/references/referenceCache");
    vi.mocked(loadReferenceItems).mockRejectedValueOnce(new Error("net::ERR_CONNECTION_REFUSED"));
    render(
      createElement(ReferenceSelect, {
        categoryCode: "load_type",
        valueMatch: "code",
        submitField: "code",
        value: null,
        onChange: () => {},
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });
  });

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
