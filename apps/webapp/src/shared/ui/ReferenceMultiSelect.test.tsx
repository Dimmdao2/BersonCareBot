/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReferenceMultiSelect } from "./ReferenceMultiSelect";

const mockItems = [
  { id: "rid-1", code: "a", title: "Пункт один", sortOrder: 0 },
  { id: "rid-2", code: "b", title: "Пункт два", sortOrder: 1 },
];

vi.mock("@/modules/references/referenceCache", () => ({
  loadReferenceItems: vi.fn(() => Promise.resolve(mockItems)),
}));

describe("ReferenceMultiSelect", () => {
  it("first click opens list without closing (focus then click toggle bug)", async () => {
    const onChange = vi.fn();
    render(
      <ReferenceMultiSelect categoryCode="body_region" value={[]} onChange={onChange} placeholder="Добавить регион…" />,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Пункт один" })).toBeInTheDocument();
  });

  it("closes on Escape while open", async () => {
    const onChange = vi.fn();
    render(<ReferenceMultiSelect categoryCode="body_region" value={[]} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    fireEvent.keyDown(globalThis.window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });
});
