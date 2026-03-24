/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownEditor } from "./MarkdownEditor";

describe("MarkdownEditor", () => {
  it("updates preview when typing", async () => {
    const user = userEvent.setup();
    render(<MarkdownEditor name="body_md" defaultValue="" />);
    const ta = screen.getByRole("textbox", { name: /редактор/i });
    await user.type(ta, "# T");
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("inserts bold via toolbar", async () => {
    const user = userEvent.setup();
    render(<MarkdownEditor name="body_md" defaultValue="hi" />);
    const ta = screen.getByRole("textbox", { name: /редактор/i }) as HTMLTextAreaElement;
    await user.click(ta);
    ta.setSelectionRange(0, 2);
    await user.click(screen.getByRole("button", { name: /жирный/i }));
    expect(ta).toHaveValue("**hi**");
  });
});
