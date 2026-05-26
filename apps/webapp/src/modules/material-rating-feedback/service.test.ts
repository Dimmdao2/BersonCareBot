import { describe, expect, it, beforeEach } from "vitest";
import { createMaterialRatingFeedbackService } from "./service";
import {
  createInMemoryMaterialRatingFeedbackPort,
  resetInMemoryMaterialRatingFeedbackForTests,
} from "@/infra/repos/inMemoryMaterialRatingFeedback";

const PAGE_ID = "550e8400-e29b-41d4-a716-446655440099";
const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("material-rating-feedback service", () => {
  beforeEach(() => {
    resetInMemoryMaterialRatingFeedbackForTests();
  });

  it("rejects feedback when page is not daily warmup", async () => {
    const service = createMaterialRatingFeedbackService({
      feedback: createInMemoryMaterialRatingFeedbackPort(),
      isDailyWarmupContentPage: async () => false,
    });
    const result = await service.submitPatientFeedback({
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 2,
      reasonCodes: ["too_hard"],
      comment: null,
    });
    expect(result).toEqual({ ok: false, code: "not_daily_warmup" });
  });

  it("stores feedback and aggregates doctor summary", async () => {
    const port = createInMemoryMaterialRatingFeedbackPort();
    const service = createMaterialRatingFeedbackService({
      feedback: port,
      isDailyWarmupContentPage: async () => true,
    });

    await service.submitPatientFeedback({
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 1,
      reasonCodes: ["too_hard", "video_quality"],
      comment: "Сложно",
    });
    await service.submitPatientFeedback({
      userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      contentPageId: PAGE_ID,
      ratingValue: 3,
      reasonCodes: ["too_hard"],
      comment: null,
    });

    const summary = await service.getDoctorSummary(PAGE_ID);
    expect(summary.total).toBe(2);
    expect(summary.byReasonCode.too_hard).toBe(2);
    expect(summary.byReasonCode.video_quality).toBe(1);
    expect(summary.recent.some((row) => row.comment === "Сложно")).toBe(true);
  });

  it("lists doctor feedback rows with pagination", async () => {
    const port = createInMemoryMaterialRatingFeedbackPort();
    const service = createMaterialRatingFeedbackService({
      feedback: port,
      isDailyWarmupContentPage: async () => true,
    });

    await service.submitPatientFeedback({
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 1,
      reasonCodes: ["too_hard"],
      comment: "first",
    });
    await service.submitPatientFeedback({
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 2,
      reasonCodes: ["other"],
      comment: "second",
    });

    const all = await service.listDoctorFeedbackForPage(PAGE_ID, 10, 0);
    expect(all).toHaveLength(2);
    expect(all.map((row) => row.comment)).toEqual(expect.arrayContaining(["first", "second"]));

    const page = await service.listDoctorFeedbackForPage(PAGE_ID, 1, 0);
    expect(page).toHaveLength(1);
  });
});
