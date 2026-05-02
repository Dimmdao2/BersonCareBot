/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Recommendation } from "@/modules/recommendations/types";
import { EMPTY_RECOMMENDATION_USAGE_SNAPSHOT } from "@/modules/recommendations/types";
import type { ArchiveRecommendationState, SaveRecommendationState } from "./actionsShared";
import { RecommendationForm } from "./RecommendationForm";

vi.mock("./actions", async () => {
  const actual = await vi.importActual<typeof import("./actions")>("./actions");
  return {
    ...actual,
    fetchDoctorRecommendationUsageSnapshot: vi.fn(async () => ({ ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT })),
  };
});

function makeRecommendation(over: Partial<Recommendation>): Recommendation {
  return {
    id: "rec-1",
    title: "T",
    bodyMd: "b",
    media: [],
    tags: null,
    domain: null,
    isArchived: false,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("RecommendationForm", () => {
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
      <RecommendationForm recommendation={a} saveAction={saveAction} archiveAction={archiveAction} />,
    );
    expect(screen.getByLabelText(/^название$/i)).toHaveValue("Alpha");

    rerender(<RecommendationForm recommendation={b} saveAction={saveAction} archiveAction={archiveAction} />);
    expect(screen.getByLabelText(/^название$/i)).toHaveValue("Beta");
  });
});
