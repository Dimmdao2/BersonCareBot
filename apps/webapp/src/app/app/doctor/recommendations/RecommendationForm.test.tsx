/** @vitest-environment jsdom */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Recommendation } from "@/modules/recommendations/types";
import { EMPTY_RECOMMENDATION_USAGE_SNAPSHOT } from "@/modules/recommendations/types";
import type { ArchiveRecommendationState, SaveRecommendationState } from "./actionsShared";
import { RecommendationForm } from "./RecommendationForm";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import { RECOMMENDATION_TYPE_CATEGORY_CODE } from "@/modules/recommendations/recommendationDomain";
import type { ReferenceItem } from "@/modules/references/types";

vi.mock("@/shared/ui/ReferenceMultiSelect", () => ({
  ReferenceMultiSelect: () => <div data-testid="region-multi" />,
}));

let recommendationTypeItems: ReferenceItem[];

beforeAll(async () => {
  recommendationTypeItems = await inMemoryReferencesPort.listActiveItemsByCategoryCode(
    RECOMMENDATION_TYPE_CATEGORY_CODE,
  );
});

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    fetchDoctorRecommendationUsageSnapshot: vi.fn(async () => ({ ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT })),
  };
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const u = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (u.includes("/api/references/body_region")) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, items: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: false, items: [] }), { status: 404 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeRecommendation(over: Partial<Recommendation>): Recommendation {
  return {
    id: "rec-1",
    title: "T",
    bodyMd: "b",
    media: [],
    tags: null,
    domain: null,
    bodyRegionId: null,
    bodyRegionIds: [],
    quantityText: null,
    frequencyText: null,
    durationText: null,
    isArchived: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("RecommendationForm", () => {
  it("labels catalog type field as Тип", () => {
    const saveAction = vi.fn(async (_prev: SaveRecommendationState | null): Promise<SaveRecommendationState> => ({
      ok: true,
    }));
    const archiveAction = vi.fn(
      async (_prev: ArchiveRecommendationState | null, _fd: FormData): Promise<ArchiveRecommendationState> => ({
        ok: true,
      }),
    );
    render(
      <RecommendationForm
        domainCatalogItems={recommendationTypeItems}
        recommendation={makeRecommendation({ id: "x" })}
        saveAction={saveAction}
        archiveAction={archiveAction}
      />,
    );
    expect(screen.getByText("Тип")).toBeInTheDocument();
  });

  it("resets title when recommendation id changes", () => {
    const saveAction = vi.fn(async (_prev: SaveRecommendationState | null): Promise<SaveRecommendationState> => ({
      ok: true,
    }));
    const archiveAction = vi.fn(
      async (_prev: ArchiveRecommendationState | null, _fd: FormData): Promise<ArchiveRecommendationState> => ({
        ok: true,
      }),
    );

    const a = makeRecommendation({ id: "a", title: "Alpha" });
    const b = makeRecommendation({ id: "b", title: "Beta" });

    const { rerender } = render(
      <RecommendationForm
        domainCatalogItems={recommendationTypeItems}
        recommendation={a}
        saveAction={saveAction}
        archiveAction={archiveAction}
      />,
    );
    expect(screen.getByLabelText(/^название$/i)).toHaveValue("Alpha");

    rerender(
      <RecommendationForm
        domainCatalogItems={recommendationTypeItems}
        recommendation={b}
        saveAction={saveAction}
        archiveAction={archiveAction}
      />,
    );
    expect(screen.getByLabelText(/^название$/i)).toHaveValue("Beta");
  });
});
