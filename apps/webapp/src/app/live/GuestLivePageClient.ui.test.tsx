import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('@/shared/ui/video/VideoMeetingStage', () => ({
  VideoMeetingStage: () => <div data-testid="stage" />,
}));

import { GuestLivePageClient } from './GuestLivePageClient';

const SECRET = 'a'.repeat(43);

/**
 * ACC-02: the guest secret is high-entropy material that must not reach path, query, access logs
 * or referrer, and after it has been exchanged it must not stay behind in the address bar or in
 * session history.
 */
describe('guest live page fragment capability (ACC-02)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', `/live#${SECRET}`);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('drops the secret out of the address and history once it has been exchanged', async () => {
    // Failure: the exchanged secret stays in `location.hash`, so it survives in the browser
    // address bar, in session history and in anything that later copies the current URL.
    // Impact: a live join capability for a real consultation leaks through the guest's own
    // browser long after the call.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        session: {
          renderer: 'embedded_conference',
          endpoint: 'https://meet.example.test',
          roomReference: 'room-ref',
          accessToken: 'token',
          expiresAt: '2099-09-08T02:00:00.000Z',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getByTestId } = render(<GuestLivePageClient />);

    await waitFor(() => getByTestId('stage'));
    expect(window.location.hash).toBe('');
  });

  it('sends the secret in the request body, never in the exchanged URL', async () => {
    // Failure: the secret travels as a path segment or query parameter, where the web server
    // access log and the outgoing Referer both record it.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        session: {
          renderer: 'embedded_conference',
          endpoint: 'https://meet.example.test',
          roomReference: 'room-ref',
          accessToken: 'token',
          expiresAt: '2099-09-08T02:00:00.000Z',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<GuestLivePageClient />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(SECRET);
    expect(String(init.body)).toContain(SECRET);
  });
});
