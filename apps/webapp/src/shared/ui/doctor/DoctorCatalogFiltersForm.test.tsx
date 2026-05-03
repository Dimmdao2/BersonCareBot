/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { DoctorCatalogFiltersForm } from "./DoctorCatalogFiltersForm";

describe("DoctorCatalogFiltersForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves catalogPubArch via hidden inputs when non-default", () => {
    const { container } = render(
      <DoctorCatalogFiltersForm q="" catalogPubArch={{ arch: "archived", pub: "draft" }} />,
    );
    expect(container.querySelector('input[name="arch"]')).toHaveValue("archived");
    expect(container.querySelector('input[name="pub"]')).toHaveValue("draft");
  });

  it("omits arch and pub hiddens for default active + all", () => {
    const { container } = render(
      <DoctorCatalogFiltersForm q="" catalogPubArch={{ arch: "active", pub: "all" }} />,
    );
    expect(container.querySelector('input[name="arch"]')).toBeNull();
    expect(container.querySelector('input[name="pub"]')).toBeNull();
  });

  it("emits pub hidden for published only", () => {
    const { container } = render(
      <DoctorCatalogFiltersForm q="a" catalogPubArch={{ arch: "active", pub: "published" }} />,
    );
    expect(container.querySelector('input[name="arch"]')).toBeNull();
    expect(container.querySelector('input[name="pub"]')).toHaveValue("published");
  });
});
