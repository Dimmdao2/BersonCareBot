/** @vitest-environment jsdom */

import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      <ReferenceMultiSelect
        categoryCode="body_region"
        value={[]}
        onChange={onChange}
        placeholder="Добавить регион…"
        searchable={false}
      />,
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

  it("filters options when typing in the input", async () => {
    const onChange = vi.fn();
    render(<ReferenceMultiSelect categoryCode="body_region" value={[]} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });

    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: "два" } });

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Пункт два" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Пункт один" })).not.toBeInTheDocument();
  });

  it("adds item from filtered list and clears search", async () => {
    function Harness() {
      const [value, setValue] = useState<string[]>([]);
      return (
        <ReferenceMultiSelect categoryCode="body_region" value={value} onChange={setValue} />
      );
    }
    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });

    const combobox = screen.getByRole("combobox");
    fireEvent.focus(combobox);
    fireEvent.change(combobox, { target: { value: "один" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Пункт один" })).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByRole("button", { name: "Пункт один" }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
    expect(combobox).toHaveValue("");
    const chip = screen.getByText("Пункт один").parentElement;
    expect(within(chip!).getByLabelText("Удалить")).toBeInTheDocument();
  });

  it("closes on Escape while open", async () => {
    const onChange = vi.fn();
    render(<ReferenceMultiSelect categoryCode="body_region" value={[]} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).not.toBeDisabled();
    });

    fireEvent.focus(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    fireEvent.keyDown(globalThis.window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });
});
