import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const loadPublicInPersonSlotContextForSlugRscMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectMock(url);
    throw new Error('NEXT_REDIRECT');
  },
  notFound: () => {
    notFoundMock();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('./publicOrganizationBooking', () => ({
  loadPublicInPersonSlotContextForSlugRsc: loadPublicInPersonSlotContextForSlugRscMock,
}));

import PublicBookNewPage from './page';

const BRANCH_ID = '550e8400-e29b-41d4-a716-446655440001';
const SERVICE_ID = '550e8400-e29b-41d4-a716-446655440002';

describe('PublicBookNewPage generated widget handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPublicInPersonSlotContextForSlugRscMock.mockResolvedValue({
      ok: true,
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });
  });

  it('revalidates a generated selection and retains its slug through the slot handoff', async () => {
    await expect(
      PublicBookNewPage({
        searchParams: Promise.resolve({
          orgSlug: 'clinic-a',
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(loadPublicInPersonSlotContextForSlugRscMock).toHaveBeenCalledWith({
      orgSlug: 'clinic-a',
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });
    expect(redirectMock).toHaveBeenCalledWith(
      `/book/slot?type=in_person&orgSlug=clinic-a&branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`,
    );
  });

  it('fails closed instead of redirecting an unavailable generated selection', async () => {
    loadPublicInPersonSlotContextForSlugRscMock.mockResolvedValue({ ok: false });
    await expect(
      PublicBookNewPage({
        searchParams: Promise.resolve({
          orgSlug: 'clinic-a',
          branchId: BRANCH_ID,
          serviceId: SERVICE_ID,
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
