/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders markdown headings without executing script tags in source", () => {
    const malicious = "# Hi\n\n<script>alert(1)</script>\n\n[xss](javascript:alert(1))";
    render(<MarkdownContent text={malicious} bodyFormat="markdown" />);
    expect(screen.queryByText("alert(1)")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    const link = document.querySelector("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("strips script from legacy HTML", () => {
    const html = '<p>OK</p><script>alert(1)</script>';
    const { container } = render(<MarkdownContent text={html} bodyFormat="legacy-html" />);
    expect(container.textContent).toContain("OK");
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders markdown", () => {
    render(<MarkdownContent text={"- a\n- b"} bodyFormat="markdown" />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });
});
