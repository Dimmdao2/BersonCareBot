/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentForm } from "./ContentForm";

describe("ContentForm", () => {
  it("serializes body_md for FormData", async () => {
    const user = userEvent.setup();
    render(<ContentForm />);
    const ta = screen.getByRole("textbox", { name: /редактор/i });
    await user.clear(ta);
    await user.type(ta, "# Заголовок");
    const form = ta.closest("form");
    expect(form).not.toBeNull();
    const fd = new FormData(form!);
    expect(fd.get("body_md")).toBe("# Заголовок");
  });
});
