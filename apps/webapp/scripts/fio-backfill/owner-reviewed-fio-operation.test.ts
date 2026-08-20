import { describe, expect, it } from 'vitest';
import { buildManifest, summarizePlan } from './owner-reviewed-fio-contract';
import {
  applyOwnerReviewedFio,
  previewOwnerReviewedFio,
  type FioDatabasePort,
} from './owner-reviewed-fio-operation';

describe('owner-reviewed FIO preserve-current exceptions', () => {
  it('checks and counts a preserveCurrent row moved out of rows', async () => {
    const preservedId = '4ff57819-06ff-4938-b0d7-7470b6cf073c';
    const regularId = '36f11d6b-b035-4b1c-8d59-7fd3c1ecc4db';
    const exactCurrent = {
      displayName: 'preserved',
      firstName: null,
      lastName: null,
      patronymic: null,
      mergedIntoId: regularId,
    };
    const manifest = buildManifest({
      schemaVersion: 'bersoncare.fio-owner-review.test/v1',
      environment: 'TEST',
      runId: '8ee17d55-6f4c-4996-8886-74826e548b42',
      createdAt: '2026-07-18T22:11:54.528Z',
      reviewSourceSha256: '5'.repeat(64),
      approval: {
        decision: 'approved_for_test',
        approvedAt: '2026-07-18T22:11:54.528Z',
        reference: 'owner approval',
      },
      exceptions: {
        expectedMissing: [],
        preserveCurrent: [
          {
            id: preservedId,
            exactCurrent,
            reference: 'owner-reviewed row changed after review',
          },
        ],
      },
      rows: [
        {
          id: regularId,
          expectedBefore: {
            displayName: 'regular',
            firstName: null,
            lastName: null,
            patronymic: null,
            mergedIntoId: null,
          },
          desiredAfter: {
            displayName: 'regular',
            firstName: 'regular',
            lastName: null,
            patronymic: null,
          },
        },
      ],
    });
    const requestedIds: string[][] = [];
    const db: FioDatabasePort = {
      async readRows(ids) {
        requestedIds.push(ids);
        return [
          { id: regularId, ...manifest.rows[0].expectedBefore },
          { id: preservedId, ...exactCurrent },
        ];
      },
      async transaction() {
        throw new Error('preview must not open a transaction');
      },
    };

    const plan = await previewOwnerReviewedFio(manifest, db);

    expect(requestedIds).toEqual([[regularId, preservedId]]);
    expect(summarizePlan(plan)).toEqual({
      total: 2,
      eligibleUpdates: 1,
      alreadyMatched: 0,
      expectedMissing: 0,
      preservedCurrent: 1,
      unexpectedMissing: 0,
      unexpectedDrift: 0,
    });
  });

  it('never writes a preserveCurrent row to the database', async () => {
    const preservedId = '4ff57819-06ff-4938-b0d7-7470b6cf073c';
    const regularId = '36f11d6b-b035-4b1c-8d59-7fd3c1ecc4db';
    const exactCurrent = {
      displayName: 'preserved',
      firstName: 'Марина',
      lastName: null,
      patronymic: null,
      mergedIntoId: null,
    };
    const manifest = buildManifest({
      schemaVersion: 'bersoncare.fio-owner-review.test/v1',
      environment: 'TEST',
      runId: '8ee17d55-6f4c-4996-8886-74826e548b42',
      createdAt: '2026-07-18T22:11:54.528Z',
      reviewSourceSha256: '5'.repeat(64),
      approval: {
        decision: 'approved_for_test',
        approvedAt: '2026-07-18T22:11:54.528Z',
        reference: 'owner approval',
      },
      exceptions: {
        expectedMissing: [],
        preserveCurrent: [
          { id: preservedId, exactCurrent, reference: 'owner keeps this row as it is' },
        ],
      },
      rows: [
        {
          id: regularId,
          expectedBefore: {
            displayName: 'regular',
            firstName: null,
            lastName: null,
            patronymic: null,
            mergedIntoId: null,
          },
          desiredAfter: {
            displayName: 'regular',
            firstName: 'regular',
            lastName: null,
            patronymic: null,
          },
        },
      ],
    });

    const written: string[] = [];
    const db: FioDatabasePort = {
      async readRows() {
        throw new Error('apply must lock rows inside the transaction');
      },
      async transaction(run) {
        return run({
          async lockRows() {
            return [
              { id: regularId, ...manifest.rows[0].expectedBefore },
              { id: preservedId, ...exactCurrent },
            ];
          },
          async conditionalUpdate(id) {
            written.push(id);
            return true;
          },
        });
      },
    };

    const result = await applyOwnerReviewedFio(
      manifest,
      db,
      { async writeBeforeMutation() { return '/dev/null/rollback.json'; } },
      () => '2026-08-20T00:00:00.000Z',
      'bersoncarebot_test',
    );

    // Владелец отсмотрел эту строку и решил оставить как есть: она обязана остаться
    // вне write-set, а не просто не считаться расхождением.
    expect(written).toEqual([regularId]);
    expect(written).not.toContain(preservedId);
    expect(summarizePlan(result.plan).preservedCurrent).toBe(1);
  });
});
