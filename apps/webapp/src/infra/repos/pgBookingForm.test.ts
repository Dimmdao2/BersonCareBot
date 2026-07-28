import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDrizzleMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: getDrizzleMock,
}));

import { createPgBookingFormPort } from './pgBookingForm';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FIELD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function fieldRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: FIELD,
    organizationId: ORG,
    fieldKey: 'complaints',
    fieldType: 'textarea',
    label: 'Жалобы',
    placeholder: null,
    isRequired: true,
    visibleToPatient: true,
    visibleToStaff: true,
    sortOrder: 10,
    isActive: true,
    ...overrides,
  };
}

describe('pgBookingForm principal-safe admin mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts admin fields through db.transaction', async () => {
    const returning = vi.fn(async () => [fieldRow()]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      insert: vi.fn(() => {
        throw new Error('db insert should not run outside transaction');
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingFormPort();
    const row = await port.upsertFieldAdmin(ORG, {
      fieldKey: 'complaints',
      fieldType: 'textarea',
      label: 'Жалобы',
      placeholder: null,
      isRequired: true,
      visibleToPatient: true,
      visibleToStaff: true,
      sortOrder: 10,
      isActive: true,
    });

    expect(row).toEqual(expect.objectContaining({ id: FIELD, organizationId: ORG }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        fieldKey: 'complaints',
        fieldType: 'textarea',
        label: 'Жалобы',
      }),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates admin fields through db.transaction', async () => {
    const returning = vi.fn(async () => [fieldRow({ label: 'Основные жалобы' })]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const tx = { update };
    const db = {
      update: vi.fn(() => {
        throw new Error('db update should not run outside transaction');
      }),
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    getDrizzleMock.mockReturnValue(db);

    const port = createPgBookingFormPort();
    const row = await port.upsertFieldAdmin(ORG, {
      id: FIELD,
      fieldKey: 'complaints',
      fieldType: 'textarea',
      label: 'Основные жалобы',
      placeholder: null,
      isRequired: true,
      visibleToPatient: true,
      visibleToStaff: true,
      sortOrder: 10,
      isActive: true,
    });

    expect(row).toEqual(expect.objectContaining({ id: FIELD, label: 'Основные жалобы' }));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldKey: 'complaints',
        fieldType: 'textarea',
        label: 'Основные жалобы',
      }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });
});
