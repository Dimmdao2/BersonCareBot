/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveContentPageMock = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  saveContentPage: saveContentPageMock,
}));

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

const testSectionsTwo = [
  ...testSections,
  {
    id: "sec-2",
    slug: "news",
    title: "Новости",
    description: "",
    sortOrder: 1,
    isVisible: true,
    requiresAuth: false,
    coverImageUrl: null,
    iconImageUrl: null,
  },
];

describe("ContentForm", () => {
  beforeEach(() => {
    saveContentPageMock.mockReset();
  });

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

  it("defaults section select to initialSectionSlug when creating", () => {
    render(<ContentForm sections={testSectionsTwo} initialSectionSlug="news" />);
    const sel = document.querySelector("select[name=section]") as HTMLSelectElement;
    expect(sel.value).toBe("news");
  });

  it("ignores initialSectionSlug when slug is unknown", () => {
    render(<ContentForm sections={testSectionsTwo} initialSectionSlug="no-such" />);
    const sel = document.querySelector("select[name=section]") as HTMLSelectElement;
    expect(sel.value).toBe("lessons");
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

  it("renders section select when editing existing page", () => {
    render(
      <ContentForm
        sections={testSections}
        page={{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          section: "lessons",
          slug: "mat",
          title: "M",
          summary: "",
          bodyMd: "",
          bodyHtml: "",
          sortOrder: 0,
          isPublished: true,
          requiresAuth: false,
          videoUrl: null,
        }}
      />,
    );
    const sel = document.querySelector("select[name=section]") as HTMLSelectElement;
    expect(sel).not.toBeNull();
    expect(sel.value).toBe("lessons");
    expect(document.querySelector('input[name="page_id"]')).toHaveAttribute(
      "value",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
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

  it("shows patient-home return banner after successful save", async () => {
    const user = userEvent.setup();
    saveContentPageMock.mockResolvedValueOnce({ ok: true });
    render(
      <ContentForm
        sections={testSections}
        patientHomeContext={{ returnTo: "/app/doctor/patient-home", patientHomeBlock: "situations" }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: /заголовок/i }), "Материал");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Страница сохранена");
    });
    expect(screen.getByRole("link", { name: /главная пациента/i })).toHaveAttribute(
      "href",
      "/app/doctor/patient-home",
    );
  });
});
