import { afterEach, describe, expect, it } from 'vitest';
import { resolveScheduleParams, _resetScheduleMappingCache } from './bookingScheduleMapping.js';
import { resetRubitimeRuntimeConfigCache } from './runtimeConfig.js';

const MAPPING_ONLINE = JSON.stringify([
  {
    type: 'online',
    category: 'general',
    branchId: 10,
    cooperatorId: 20,
    serviceId: 30,
    durationMinutes: 60,
  },
  {
    type: 'online',
    category: 'rehab_lfk',
    branchId: 11,
    cooperatorId: 21,
    serviceId: 31,
    durationMinutes: 45,
  },
  {
    type: 'in_person',
    city: 'moscow',
    category: 'rehab_lfk',
    branchId: 12,
    cooperatorId: 22,
    serviceId: 32,
    durationMinutes: 60,
  },
  {
    type: 'in_person',
    city: 'spb',
    category: 'rehab_lfk',
    branchId: 13,
    cooperatorId: 23,
    serviceId: 33,
    durationMinutes: 60,
  },
]);

afterEach(() => {
  _resetScheduleMappingCache();
  resetRubitimeRuntimeConfigCache();
  delete process.env.RUBITIME_SCHEDULE_MAPPING;
});

describe('resolveScheduleParams', () => {
  it('resolves online/general to correct rubitime params', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = MAPPING_ONLINE;
    const result = await resolveScheduleParams({ type: 'online', category: 'general' });
    expect(result).toEqual({ branchId: 10, cooperatorId: 20, serviceId: 30, durationMinutes: 60 });
  });

  it('resolves online/rehab_lfk', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = MAPPING_ONLINE;
    const result = await resolveScheduleParams({ type: 'online', category: 'rehab_lfk' });
    expect(result).toEqual({ branchId: 11, cooperatorId: 21, serviceId: 31, durationMinutes: 45 });
  });

  it('resolves in_person/moscow/rehab_lfk', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = MAPPING_ONLINE;
    const result = await resolveScheduleParams({ type: 'in_person', city: 'moscow', category: 'rehab_lfk' });
    expect(result).toEqual({ branchId: 12, cooperatorId: 22, serviceId: 32, durationMinutes: 60 });
  });

  it('resolves in_person/spb/rehab_lfk', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = MAPPING_ONLINE;
    const result = await resolveScheduleParams({ type: 'in_person', city: 'spb', category: 'rehab_lfk' });
    expect(result).toEqual({ branchId: 13, cooperatorId: 23, serviceId: 33, durationMinutes: 60 });
  });

  it('returns null when no mapping matches', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = MAPPING_ONLINE;
    const result = await resolveScheduleParams({ type: 'online', category: 'nutrition' });
    expect(result).toBeNull();
  });

  it('returns null for in_person without city', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = MAPPING_ONLINE;
    const result = await resolveScheduleParams({ type: 'in_person', category: 'rehab_lfk' });
    expect(result).toBeNull();
  });

  it('returns null when env var is empty', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = '';
    const result = await resolveScheduleParams({ type: 'online', category: 'general' });
    expect(result).toBeNull();
  });

  it('returns null when env var is invalid JSON', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = 'not-json';
    const result = await resolveScheduleParams({ type: 'online', category: 'general' });
    expect(result).toBeNull();
  });

  it('skips entries with invalid shape', async () => {
    process.env.RUBITIME_SCHEDULE_MAPPING = JSON.stringify([
      { type: 'online', category: 'general', branchId: 'not-a-number', cooperatorId: 1, serviceId: 1, durationMinutes: 60 },
      { type: 'online', category: 'general', branchId: 5, cooperatorId: 5, serviceId: 5, durationMinutes: 60 },
    ]);
    const result = await resolveScheduleParams({ type: 'online', category: 'general' });
    // Second entry is valid and should match
    expect(result).toEqual({ branchId: 5, cooperatorId: 5, serviceId: 5, durationMinutes: 60 });
  });
});
