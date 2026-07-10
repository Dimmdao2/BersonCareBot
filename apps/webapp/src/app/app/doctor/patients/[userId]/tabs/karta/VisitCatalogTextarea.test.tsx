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

  it("limits long catalog lists and filters them locally", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 45 }, (_, index) => ({
      id: `m${index + 1}`,
      code: `item-${index + 1}`,
      title: index === 44 ? "Редкая манипуляция" : `Манипуляция ${index + 1}`,
      sortOrder: index + 1,
    }));
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, items }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness catalog="manipulations" />);

    await user.click(screen.getByRole("button", { name: /выбрать из справочника/i }));

    expect(await screen.findByRole("button", { name: /^манипуляция 1$/i })).toBeInTheDocument();
    expect(screen.getByText("Показано 40 из 45 — уточните поиск")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /редкая манипуляция/i })).not.toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: /поиск по справочнику/i });
    await user.type(search, "редкая");

    expect(screen.getByText("Показано 1 из 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /редкая манипуляция/i }));
    expect(screen.getByTestId("value")).toHaveTextContent("Свободная строка Редкая манипуляция");
  });

  it("moves focus from search to the first visible option with ArrowDown", async () => {
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
    const search = await screen.findByRole("searchbox", { name: /поиск по справочнику/i });
    search.focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("button", { name: /мобилизация/i })).toHaveFocus();
  });
});
