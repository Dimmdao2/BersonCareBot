/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MaterialRatingFeedbackDoctorPanel } from "./MaterialRatingFeedbackDoctorPanel";
import { MATERIAL_RATING_FEEDBACK_REASON_CODES } from "@/modules/material-rating-feedback/reasonCodes";

const PAGE_ID = "550e8400-e29b-41d4-a716-446655440099";

describe("MaterialRatingFeedbackDoctorPanel", () => {
  it("renders empty state", () => {
    render(
      <MaterialRatingFeedbackDoctorPanel
        contentPageId={PAGE_ID}
        summary={{
          total: 0,
          byReasonCode: MATERIAL_RATING_FEEDBACK_REASON_CODES.reduce(
            (acc, code) => {
              acc[code] = 0;
              return acc;
            },
            {} as Record<(typeof MATERIAL_RATING_FEEDBACK_REASON_CODES)[number], number>,
          ),
          recent: [],
        }}
      />,
    );
    expect(screen.getByText("Пока нет отзывов с низкой оценкой.")).toBeInTheDocument();
  });

  it("renders reason counts and recent comments", () => {
    render(
      <MaterialRatingFeedbackDoctorPanel
        contentPageId={PAGE_ID}
        summary={{
          total: 1,
          byReasonCode: MATERIAL_RATING_FEEDBACK_REASON_CODES.reduce(
            (acc, code) => {
              acc[code] = code === "too_hard" ? 1 : 0;
              return acc;
            },
            {} as Record<(typeof MATERIAL_RATING_FEEDBACK_REASON_CODES)[number], number>,
          ),
          recent: [
            {
              id: "fb-1",
              userId: "user-1",
              displayLabel: "Пациент",
              ratingValue: 2,
              reasonCodes: ["too_hard"],
              comment: "Тяжело",
              createdAt: "2026-05-26T10:00:00.000Z",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Всего: 1")).toBeInTheDocument();
    expect(screen.getByText("Тяжело")).toBeInTheDocument();
    expect(screen.getByText("Пациент")).toBeInTheDocument();
  });
});
