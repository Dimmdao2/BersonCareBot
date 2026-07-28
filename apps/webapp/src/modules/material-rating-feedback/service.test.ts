import { describe, expect, it, beforeEach } from 'vitest';
import { createMaterialRatingFeedbackService } from './service';
import {
  createInMemoryMaterialRatingFeedbackPort,
  resetInMemoryMaterialRatingFeedbackForTests,
} from '@/infra/repos/inMemoryMaterialRatingFeedback';

const PAGE_ID = '550e8400-e29b-41d4-a716-446655440099';
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('material-rating-feedback service', () => {
  beforeEach(() => {
    resetInMemoryMaterialRatingFeedbackForTests();
  });

  it('rejects feedback when page is not daily warmup', async () => {
    const service = createMaterialRatingFeedbackService({
      feedback: createInMemoryMaterialRatingFeedbackPort(),
      isDailyWarmupContentPage: async () => false,
    });
    const result = await service.submitPatientFeedback({
      organizationId: ORG_A,
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 2,
      reasonCodes: ['too_hard'],
      comment: null,
    });
    expect(result).toEqual({ ok: false, code: 'not_daily_warmup' });
  });

  it('stores feedback and aggregates doctor summary', async () => {
    const port = createInMemoryMaterialRatingFeedbackPort();
    const service = createMaterialRatingFeedbackService({
      feedback: port,
      isDailyWarmupContentPage: async () => true,
    });

    await service.submitPatientFeedback({
      organizationId: ORG_A,
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 1,
      reasonCodes: ['too_hard', 'video_quality'],
      comment: 'Сложно',
    });
    await service.submitPatientFeedback({
      organizationId: ORG_A,
      userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      contentPageId: PAGE_ID,
      ratingValue: 3,
      reasonCodes: ['too_hard'],
      comment: null,
    });

    const summary = await service.getDoctorSummary({
      organizationId: ORG_A,
      contentPageId: PAGE_ID,
    });
    expect(summary.total).toBe(2);
    expect(summary.byReasonCode.too_hard).toBe(2);
    expect(summary.byReasonCode.video_quality).toBe(1);
    expect(summary.recent.some((row) => row.comment === 'Сложно')).toBe(true);
  });

  it('lists doctor feedback rows with pagination', async () => {
    const port = createInMemoryMaterialRatingFeedbackPort();
    const service = createMaterialRatingFeedbackService({
      feedback: port,
      isDailyWarmupContentPage: async () => true,
    });

    await service.submitPatientFeedback({
      organizationId: ORG_A,
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 1,
      reasonCodes: ['too_hard'],
      comment: 'first',
    });
    await service.submitPatientFeedback({
      organizationId: ORG_A,
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 2,
      reasonCodes: ['other'],
      comment: 'second',
    });

    const all = await service.listDoctorFeedbackForPage({
      organizationId: ORG_A,
      contentPageId: PAGE_ID,
      limit: 10,
      offset: 0,
    });
    expect(all).toHaveLength(2);
    expect(all.map((row) => row.comment)).toEqual(expect.arrayContaining(['first', 'second']));

    const page = await service.listDoctorFeedbackForPage({
      organizationId: ORG_A,
      contentPageId: PAGE_ID,
      limit: 1,
      offset: 0,
    });
    expect(page).toHaveLength(1);
  });

  it('does not disclose feedback for the same page id from another organization', async () => {
    const port = createInMemoryMaterialRatingFeedbackPort();
    const service = createMaterialRatingFeedbackService({
      feedback: port,
      isDailyWarmupContentPage: async () => true,
    });
    await service.submitPatientFeedback({
      organizationId: ORG_A,
      userId: USER_ID,
      contentPageId: PAGE_ID,
      ratingValue: 1,
      reasonCodes: ['too_hard'],
      comment: 'A',
    });
    await service.submitPatientFeedback({
      organizationId: ORG_B,
      userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      contentPageId: PAGE_ID,
      ratingValue: 3,
      reasonCodes: ['other'],
      comment: 'B',
    });

    await expect(
      service.getDoctorSummary({ organizationId: ORG_A, contentPageId: PAGE_ID }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      service.listDoctorFeedbackForPage({
        organizationId: ORG_B,
        contentPageId: PAGE_ID,
        limit: 10,
        offset: 0,
      }),
    ).resolves.toEqual([expect.objectContaining({ comment: 'B' })]);
  });

  it('does not accept a foreign or NULL warmup target for the resolved organization', async () => {
    const isDailyWarmupContentPage = async ({
      organizationId,
    }: {
      contentPageId: string;
      organizationId: string;
    }) => organizationId === ORG_A;
    const service = createMaterialRatingFeedbackService({
      feedback: createInMemoryMaterialRatingFeedbackPort(),
      isDailyWarmupContentPage,
    });

    await expect(
      service.submitPatientFeedback({
        organizationId: ORG_B,
        userId: USER_ID,
        contentPageId: PAGE_ID,
        ratingValue: 1,
        reasonCodes: ['other'],
        comment: null,
      }),
    ).resolves.toEqual({ ok: false, code: 'not_daily_warmup' });
  });
});
