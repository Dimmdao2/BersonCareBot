/** @vitest-environment jsdom */

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisitCatalogTextarea } from "./VisitCatalogTextarea";

function Harness({ catalog }: { catalog: "manipulations" | "recommendations" }) {
  const [value, setValue] = useState("Свободная строка");
  return (
    <>
      <VisitCatalogTextarea label="Поле визита" value={value} onChange={setValue} catalog={catalog} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("VisitCatalogTextarea", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads manipulation options from references and appends selection to free text", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          items: [{ id: "m1", code: "mobilization", title: "Мобилизация", sortOrder: 10 }],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness catalog="manipulations" />);

    await user.click(screen.getByRole("button", { name: /выбрать из справочника/i }));
    await user.click(await screen.findByRole("button", { name: /мобилизация/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/doctor/references/visit_manipulation", {
      credentials: "include",
    });
    expect(screen.getByTestId("value")).toHaveTextContent("Свободная строка Мобилизация");
  });

  it("loads active recommendations and appends title, metrics and body", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          items: [
            {
              id: "r1",
              title: "Ходьба",
              bodyMd: "20 минут",
              media: [],
              domain: "regimen",
              bodyRegionId: null,
              bodyRegionIds: [],
              quantityText: "1 раз",
              frequencyText: "ежедневно",
              durationText: "2 недели",
              tags: null,
              isArchived: false,
              createdBy: null,
              createdAt: "2026-07-06T00:00:00.000Z",
              updatedAt: "2026-07-06T00:00:00.000Z",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness catalog="recommendations" />);

    await user.click(screen.getByRole("button", { name: /выбрать из справочника/i }));
    await user.click(await screen.findByRole("button", { name: /ходьба/i }));

    expect(fetchMock).toHaveBeenCalledWith("/api/doctor/recommendations", {
      credentials: "include",
    });
    expect(screen.getByTestId("value")).toHaveTextContent(
      "Свободная строка Ходьба 1 раз · ежедневно · 2 недели 20 минут",
    );
  });
});
