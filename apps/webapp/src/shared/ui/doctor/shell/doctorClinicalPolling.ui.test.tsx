import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDoctorSupportUnreadCountPolling } from '@/modules/messaging/hooks/useSupportUnreadPolling';
import { useDoctorPendingProgramTestsCount } from '@/modules/treatment-program/hooks/useDoctorPendingProgramTestsCount';

function Pollers({ enabled }: { enabled: boolean }) {
  useDoctorSupportUnreadCountPolling(enabled);
  useDoctorPendingProgramTestsCount(enabled);
  return null;
}

afterEach(() => vi.unstubAllGlobals());

describe('doctor clinical badge polling capability', () => {
  it('mounts no unread/summary request while disabled and restores both after enabling', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requested.push(String(input));
        return {
          ok: true,
          json: async () =>
            String(input).includes('unread-count') ? { ok: true, unreadCount: 0 } : { count: 0 },
        } as Response;
      }),
    );

    const view = render(<Pollers enabled={false} />);
    await Promise.resolve();
    expect(requested).toEqual([]);

    view.rerender(<Pollers enabled />);
    await waitFor(() =>
      expect(requested).toEqual(
        expect.arrayContaining([
          '/api/doctor/messages/unread-count',
          '/api/doctor/pending-program-tests/summary',
        ]),
      ),
    );

    view.rerender(<Pollers enabled={false} />);
    const afterDisable = requested.length;
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(requested).toHaveLength(afterDisable);
  });
});
