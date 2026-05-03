/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LfkTemplateStatusBadge, lfkTemplateStatusLabel } from "./LfkTemplateStatusBadge";

describe("LfkTemplateStatusBadge", () => {
  it("renders labels for each status", () => {
    const { rerender } = render(<LfkTemplateStatusBadge status="draft" />);
    expect(screen.getByText(lfkTemplateStatusLabel("draft"))).toBeInTheDocument();

    rerender(<LfkTemplateStatusBadge status="published" />);
    expect(screen.getByText(lfkTemplateStatusLabel("published"))).toBeInTheDocument();

    rerender(<LfkTemplateStatusBadge status="archived" />);
    expect(screen.getByText(lfkTemplateStatusLabel("archived"))).toBeInTheDocument();
  });
});
