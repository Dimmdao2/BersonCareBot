/** @vitest-environment jsdom */

import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const saveContentPageMock = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  saveContentPage: saveContentPageMock,
}));

vi.mock("@/shared/ui/doctor/markdown/MarkdownEditor", () => ({
  MarkdownEditor: ({
    name,
    defaultValue = "",
    onChange,
  }: {
    name: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
  }) => {
    const [value, setValue] = useState(defaultValue);
    return (
      <label>
        <span>Редактор</span>
        <textarea
          aria-label="Редактор"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onChange?.(event.target.value);
          }}
        />
        <input type="hidden" name={name} value={value} readOnly />
      </label>
    );
  },
}));

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
    kind: "system" as const,
    systemParentCode: "lessons" as const,
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
    kind: "article" as const,
    systemParentCode: null,
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

  it("preserves legacy HTML until an explicit non-empty Markdown replacement", async () => {
    const user = userEvent.setup();
    const legacyHtml = "<p>Старый <strong>материал</strong></p><script>unsafe()</script>";
    render(
      <ContentForm
        sections={testSections}
        page={{
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          section: "lessons",
          slug: "legacy",
          title: "Старый материал",
          summary: "",
          bodyMd: "",
          bodyHtml: legacyHtml,
          sortOrder: 0,
          isPublished: true,
          requiresAuth: false,
          videoUrl: null,
        }}
      />,
    );

    expect(screen.queryByRole("textbox", { name: /редактор/i })).not.toBeInTheDocument();
    expect(screen.getByText("Старый")).toBeInTheDocument();
    expect(screen.getByText("материал")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();

    const title = screen.getByRole("textbox", { name: /заголовок/i });
    await user.type(title, " обновлён");
    const formBeforeReplacement = title.closest("form");
    expect(formBeforeReplacement).not.toBeNull();
    const preserved = new FormData(formBeforeReplacement!);
    expect(preserved.get("body_md")).toBe("");
    expect(preserved.get("body_html")).toBe(legacyHtml);

    await user.click(screen.getByRole("button", { name: "Начать замену на Markdown" }));
    const editor = screen.getByRole("textbox", { name: /редактор/i });
    expect(formBeforeReplacement!.querySelector('input[name="body_md"]')).toHaveValue("");
    expect(new FormData(formBeforeReplacement!).get("body_html")).toBe(legacyHtml);

    await user.type(editor, "# Новый материал");
    const replacement = new FormData(formBeforeReplacement!);
    expect(replacement.get("body_md")).toBe("# Новый материал");
    expect(replacement.get("body_html")).toBe(legacyHtml);
  });

  it("defaults section select to initialSectionSlug when creating", () => {
    render(<ContentForm sections={testSectionsTwo} initialSectionSlug="news" />);
    // base-ui Select renders a hidden input for form submission; no native <select>
    const sel = document.querySelector("input[name=section]") as HTMLInputElement;
    expect(sel).not.toBeNull();
    expect(sel.value).toBe("news");
  });

  it("ignores initialSectionSlug when slug is unknown", () => {
    render(<ContentForm sections={testSectionsTwo} initialSectionSlug="no-such" />);
    const sel = document.querySelector("input[name=section]") as HTMLInputElement;
    expect(sel).not.toBeNull();
    expect(sel.value).toBe("lessons");
  });

  it("renders section options from sections prop", () => {
    render(<ContentForm sections={testSections} />);
    // base-ui Select renders a hidden input for form submission; no native <select>
    const sel = document.querySelector("input[name=section]") as HTMLInputElement;
    expect(sel).not.toBeNull();
    expect(sel.value).toBe("lessons");
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
        materialRatingSummary={{ avg: 4.5, count: 12 }}
      />,
    );
    expect(screen.getByText(/Оценки пациентов/i)).toBeInTheDocument();
    // base-ui Select renders a hidden input for form submission; no native <select>
    const sel = document.querySelector("input[name=section]") as HTMLInputElement;
    expect(sel).not.toBeNull();
    expect(sel.value).toBe("lessons");
    expect(document.querySelector('input[name="page_id"]')).toHaveAttribute(
      "value",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(document.querySelector('input[name="slug"]')).not.toHaveAttribute("readonly");
  });

  it("includes linked_course_id in FormData when publishedCourses provided", async () => {
    const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const user = userEvent.setup();
    render(
      <ContentForm
        sections={testSections}
        publishedCourses={[{ id: courseId, title: "Курс А" }]}
      />,
    );
    // base-ui Select: click trigger to open, then click item (canonical pattern)
    await user.click(screen.getByLabelText(/связан с курсом/i));
    await user.click(screen.getByRole("option", { name: /Курс А/i }));
    // Verify the SELECTED VALUE is transmitted in FormData (not just field presence)
    const ta = screen.getByRole("textbox", { name: /редактор/i });
    const form = ta.closest("form");
    expect(form).not.toBeNull();
    expect(new FormData(form!).get("linked_course_id")).toBe(courseId);
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
