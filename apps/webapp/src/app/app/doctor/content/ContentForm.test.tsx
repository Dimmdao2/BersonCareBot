/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/shared/ui/markdown/MarkdownEditorToastUi", async () => {
  const { MarkdownEditor } = await import("@/shared/ui/markdown/MarkdownEditor");
  return {
    MarkdownEditorToastUi: (props: { name: string; defaultValue?: string }) => (
      <MarkdownEditor name={props.name} defaultValue={props.defaultValue ?? ""} />
    ),
  };
});

import { ContentForm } from "./ContentForm";

const testSections = [
  {
    id: "sec-1",
    slug: "lessons",
    title: "Полезные уроки",
    description: "",
    sortOrder: 0,
    isVisible: true,
    requiresAuth: false,
    coverImageUrl: null,
    iconImageUrl: null,
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

  it("includes linked_course_id in FormData when publishedCourses provided", async () => {
    const user = userEvent.setup();
    const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    render(
      <ContentForm
        sections={testSections}
        publishedCourses={[{ id: courseId, title: "Курс А" }]}
      />,
    );
    const sel = document.querySelector("select[name=linked_course_id]") as HTMLSelectElement;
    expect(sel).not.toBeNull();
    await user.selectOptions(sel, courseId);
    const ta = screen.getByRole("textbox", { name: /редактор/i });
    const form = ta.closest("form");
    expect(form).not.toBeNull();
    const fd = new FormData(form!);
    expect(fd.get("linked_course_id")).toBe(courseId);
  });

  it("shows page preview block when toggled", async () => {
    const user = userEvent.setup();
    render(<ContentForm sections={testSections} />);
    await user.click(screen.getByRole("button", { name: /показать предпросмотр/i }));
    expect(screen.getByText(/предпросмотр для пациента/i)).toBeInTheDocument();
  });
});
