/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentPagesSidebar } from "./ContentPagesSidebar";

describe("ContentPagesSidebar", () => {
  const articleSections = [
    { slug: "antistress", title: "Антистресс" },
    { slug: "health-50", title: "Здоровье 50+" },
  ];

  it("renders motivation, sections, articles, system folders without library link", () => {
    render(
      <ContentPagesSidebar
        articleSections={articleSections}
        highlightArticleSlug={null}
        highlightSystemFolderCode={null}
      />,
    );
    expect(screen.getByRole("link", { name: "Мотивации" })).toHaveAttribute("href", "/app/doctor/content/motivation");
    expect(screen.getByRole("link", { name: "Разделы" })).toHaveAttribute("href", "/app/doctor/content/sections");
    expect(screen.getByRole("link", { name: "Все страницы" })).toHaveAttribute("href", "/app/doctor/content");
    expect(screen.getByRole("link", { name: "Антистресс" })).toHaveAttribute(
      "href",
      "/app/doctor/content?section=antistress",
    );
    expect(screen.getByRole("link", { name: "Ситуации" })).toHaveAttribute(
      "href",
      "/app/doctor/content?systemParentCode=situations",
    );
    expect(screen.getByRole("link", { name: "SOS" })).toHaveAttribute("href", "/app/doctor/content?systemParentCode=sos");
    expect(screen.getByRole("link", { name: "Разминки" })).toHaveAttribute(
      "href",
      "/app/doctor/content?systemParentCode=warmups",
    );
    expect(screen.getByRole("link", { name: "Уроки" })).toHaveAttribute(
      "href",
      "/app/doctor/content?systemParentCode=lessons",
    );
    expect(screen.queryByRole("link", { name: "Библиотека файлов" })).not.toBeInTheDocument();
  });

  it("marks all pages active when no highlight", () => {
    render(
      <ContentPagesSidebar
        articleSections={articleSections}
        highlightArticleSlug={null}
        highlightSystemFolderCode={null}
      />,
    );
    expect(screen.getByRole("link", { name: "Все страницы" })).toHaveAttribute("aria-current", "page");
  });

  it("marks article section and system folder active", () => {
    const { rerender } = render(
      <ContentPagesSidebar
        articleSections={articleSections}
        highlightArticleSlug="antistress"
        highlightSystemFolderCode={null}
      />,
    );
    expect(screen.getByRole("link", { name: "Антистресс" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Все страницы" })).not.toHaveAttribute("aria-current");

    rerender(
      <ContentPagesSidebar
        articleSections={articleSections}
        highlightArticleSlug={null}
        highlightSystemFolderCode="warmups"
      />,
    );
    expect(screen.getByRole("link", { name: "Разминки" })).toHaveAttribute("aria-current", "page");
  });
});
