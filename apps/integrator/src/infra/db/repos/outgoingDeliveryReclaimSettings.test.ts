import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG,
  getOutgoingDeliveryReclaimConfig,
} from './outgoingDeliveryReclaimSettings.js';

function reclaimDb(valueJson: unknown | null): DbPort {
  return {
    query: vi
      .fn()
      .mockResolvedValue(valueJson === null ? { rows: [] } : { rows: [{ value_json: valueJson }] }),
    tx: vi.fn(),
  } as unknown as DbPort;
}

function failingDb(error: Error): DbPort {
  return {
    query: vi.fn().mockRejectedValue(error),
    tx: vi.fn(),
  } as unknown as DbPort;
}

describe('getOutgoingDeliveryReclaimConfig', () => {
  it('дано: capability вернула кастомные значения → тогда воркер видит именно их, не дефолт', async () => {
    const custom = {
      value: { processingTimeoutMinutes: 42, doneRetentionDays: 7, maxReclaimCount: 3 },
    };
    await expect(getOutgoingDeliveryReclaimConfig(reclaimDb(custom))).resolves.toEqual({
      processingTimeoutMinutes: 42,
      doneRetentionDays: 7,
      maxReclaimCount: 3,
    });
  });

  it('дано: настройка отсутствует → тогда безопасный дефолт', async () => {
    await expect(getOutgoingDeliveryReclaimConfig(reclaimDb(null))).resolves.toEqual(
      DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG,
    );
  });

  it('дано: чтение (capability) отказано/недоступно → тогда безопасный дефолт, ошибка не всплывает', async () => {
    await expect(
      getOutgoingDeliveryReclaimConfig(
        failingDb(new Error('permission denied for function read_outgoing_delivery_reclaim_config')),
      ),
    ).resolves.toEqual(DEFAULT_OUTGOING_DELIVERY_RECLAIM_CONFIG);
  });
});
