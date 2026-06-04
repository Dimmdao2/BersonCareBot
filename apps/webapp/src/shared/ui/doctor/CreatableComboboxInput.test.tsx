/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatableComboboxInput } from "./CreatableComboboxInput";

describe("CreatableComboboxInput", () => {
  it("shows destructive message when onCreate rejects", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => {
      throw new Error("Код уже занят");
    });

    render(
      <CreatableComboboxInput
        items={[]}
        value={null}
        onChange={() => {}}
        onCreate={onCreate}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Новый вид");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Код уже занят");
    });
    expect(onCreate).toHaveBeenCalled();
  });
});
