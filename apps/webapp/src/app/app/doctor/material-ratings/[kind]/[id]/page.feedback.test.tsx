/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MaterialRatingFeedbackDoctorPanel } from "@/app/app/doctor/material-ratings/MaterialRatingFeedbackDoctorPanel";
import { MATERIAL_RATING_FEEDBACK_REASON_CODES } from "@/modules/material-rating-feedback/reasonCodes";

const PAGE_ID = "550e8400-e29b-41d4-a716-446655440099";

describe("Doctor material rating detail feedback section", () => {
  it("renders feedback block for content_page detail page payload", () => {
    render(
      <MaterialRatingFeedbackDoctorPanel
        contentPageId={PAGE_ID}
        summary={{
          total: 1,
          byReasonCode: MATERIAL_RATING_FEEDBACK_REASON_CODES.reduce(
            (acc, code) => {
              acc[code] = code === "video_quality" ? 1 : 0;
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
              reasonCodes: ["video_quality"],
              comment: "Плохое видео",
              createdAt: "2026-05-26T10:00:00.000Z",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Обратная связь (1–3)")).toBeInTheDocument();
    expect(screen.getByText("Плохое видео")).toBeInTheDocument();
  });
});
