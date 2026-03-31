/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContentForm } from "./ContentForm";

const testSections = [
  {
    id: "sec-1",
    slug: "lessons",
    title: "Полезные уроки",
    description: "",
    sortOrder: 0,
    isVisible: true,
  },
];

describe("ContentForm", () => {
  it("serializes body_md for FormData", async () => {
    const user = userEvent.setup();
    render(<ContentForm sections={testSections} />);
    const ta = screen.getByRole("textbox", { name: /редактор/i });
    await user.clear(ta);
    await user.type(ta, "# Заголовок");
    const form = ta.closest("form");
    expect(form).not.toBeNull();
    const fd = new FormData(form!);
    expect(fd.get("body_md")).toBe("# Заголовок");
  });

  it("renders section options from sections prop", () => {
    render(<ContentForm sections={testSections} />);
    const sel = document.querySelector("select[name=section]") as HTMLSelectElement;
    expect(sel).not.toBeNull();
    expect(sel.options.length).toBe(1);
    expect(sel.options[0]?.value).toBe("lessons");
  });

  it("includes image_url input", () => {
    render(<ContentForm sections={testSections} />);
    expect(document.querySelector('input[name="image_url"]')).not.toBeNull();
  });

  it("does not include legacy sort_order input", () => {
    render(<ContentForm sections={testSections} />);
    expect(document.querySelector('input[name="sort_order"]')).toBeNull();
  });

  it("shows page preview block when toggled", async () => {
    const user = userEvent.setup();
    render(<ContentForm sections={testSections} />);
    await user.click(screen.getByRole("button", { name: /показать предпросмотр/i }));
    expect(screen.getByText(/предпросмотр для пациента/i)).toBeInTheDocument();
  });
});
