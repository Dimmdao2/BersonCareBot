import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * UI-08 (owner-correction 08.09.2026): opening the doctor live page may prepare the meeting/
 * invite/notification once, but must not mount the Jitsi adapter or request camera/microphone.
 * Only an explicit Play ("Начать звонок") click re-calls the same create-or-resume route for
 * fresh join-material and mounts the adapter. `VideoMeetingStage` is the only seam that ever
 * receives provider join material, so it is stubbed here purely to observe what session (if any)
 * the client forwards to it — the stub carries no Jitsi/DOM behavior of its own.
 */
const stageSessions: Array<{ roomReference: string } | null> = [];
vi.mock('@/shared/ui/video/VideoMeetingStage', () => ({
  VideoMeetingStage: ({ session }: { session: { roomReference: string } | null }) => {
    stageSessions.push(session ? { roomReference: session.roomReference } : null);
    return <div data-testid="stage">{session ? `mounted:${session.roomReference}` : 'idle'}</div>;
  },
}));
vi.mock('@/app/app/doctor/clients/DoctorNotesPanel', () => ({
  DoctorNotesPanel: () => <div data-testid="notes-panel">notes</div>,
}));
vi.mock('../visits/EncounterPageClient', () => ({
  EncounterPageClient: () => <div data-testid="encounter-panel">encounter</div>,
}));

const { DoctorLiveMeetingClient } = await import('./DoctorLiveMeetingClient');

const patient = { displayName: 'Иван Иванов', firstName: 'Иван', lastName: 'Иванов', phone: null };

function sessionPayload(roomReference: string) {
  return {
    ok: true,
    meetingId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    session: {
      renderer: 'embedded_conference',
      endpoint: 'https://meet.example.test',
      roomReference,
      accessToken: `token-${roomReference}`,
      expiresAt: '2099-09-08T02:00:00.000Z',
    },
    guestUrl: null,
  };
}

describe('DoctorLiveMeetingClient — Play gates the adapter mount (UI-08)', () => {
  beforeEach(() => {
    stageSessions.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('prepares once on open without mounting the adapter, then Play issues a fresh join and mounts exactly one adapter', async () => {
    // Failure: opening the page alone already forwards join material into the video adapter, so
    // Jitsi mounts and requests camera/microphone before the specialist ever asked to start.
    // Impact: every open of the client card silently turns on camera/mic (owner-correction
    // 08.09.2026: "открытие страницы не подключает специалиста к Jitsi и не включает media само").
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => sessionPayload('prepare-room') })
      .mockResolvedValueOnce({ ok: true, json: async () => sessionPayload('play-room') });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DoctorLiveMeetingClient
        userId="11111111-1111-4111-8111-111111111111"
        appointmentId={null}
        patient={patient}
        encountersEnabled={false}
        medicalRecordEnabled={false}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The prepare response already carries a session shape (current create-or-resume always joins),
    // but the client must not forward it into the adapter before Play.
    expect(stageSessions.every((s) => s === null)).toBe(true);
    expect(stageSessions.some((s) => s?.roomReference === 'prepare-room')).toBe(false);

    const playButton = await screen.findByRole('button', { name: /начать звонок/i });
    fireEvent.click(playButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(stageSessions.some((s) => s?.roomReference === 'play-room')).toBe(true),
    );
    expect(stageSessions.some((s) => s?.roomReference === 'prepare-room')).toBe(false);
  });

  it('does not mount a second adapter or issue a second join request on a rapid double click of Play', async () => {
    // Failure: a fast double click fires two create-or-resume POSTs and mounts two Jitsi
    // instances/adapters for the same call.
    // Impact: two competing sessions/adapters for the same specialist (UI-08 double-click guard).
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => sessionPayload('prepare-room') })
      .mockResolvedValueOnce({ ok: true, json: async () => sessionPayload('play-room') });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DoctorLiveMeetingClient
        userId="11111111-1111-4111-8111-111111111111"
        appointmentId={null}
        patient={patient}
        encountersEnabled={false}
        medicalRecordEnabled={false}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const playButton = await screen.findByRole('button', { name: /начать звонок/i });
    fireEvent.click(playButton);
    fireEvent.click(playButton);

    await waitFor(() =>
      expect(stageSessions.some((s) => s?.roomReference === 'play-room')).toBe(true),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fire a second create-or-resume POST when Play is clicked while the initial auto-prepare is still in flight', async () => {
    // Failure: the mount effect's auto-prepare POST (mount=false, no adapter) and a Play click
    // are guarded by two different flags (`startedRef` vs. `starting`/`session`) that never see
    // each other. A specialist who clicks Play before that first request resolves (a slow network,
    // or simply a fast click) fires a second concurrent create-or-resume POST for the same
    // appointment before either has finished.
    // Impact: two concurrent create-or-resume calls can both observe "no active meeting yet" and
    // each independently mint a meeting/invite/notification, or race into two competing sessions —
    // exactly the "Повторные быстрые нажатия не создают несколько ... app-sessions" UI-08 guarantee,
    // just from the other side of the mount-vs-Play boundary the existing double-click test doesn't
    // reach (that test waits for the first POST to resolve before ever clicking Play).
    let resolveFirst: (value: unknown) => void = () => {};
    const firstPending = new Promise((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstPending)
      .mockResolvedValueOnce({ ok: true, json: async () => sessionPayload('play-room') });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DoctorLiveMeetingClient
        userId="11111111-1111-4111-8111-111111111111"
        appointmentId={null}
        patient={patient}
        encountersEnabled={false}
        medicalRecordEnabled={false}
      />,
    );
    // Confirms the auto-prepare POST has actually been issued (not merely scheduled) while it is
    // still deliberately left unresolved.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const playButton = await screen.findByRole('button', { name: /начать звонок/i });

    try {
      fireEvent.click(playButton);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      // Let the deliberately stalled first request settle so no update leaks into a later test.
      await act(async () => {
        resolveFirst({ ok: true, json: async () => sessionPayload('prepare-room') });
        await Promise.resolve();
      });
    }
  });

  it('keeps the prepared invite URL copyable when Play resumes with guestUrl=null', async () => {
    // Failure: Play refreshes only the short-lived specialist session, so ACC-08 correctly
    // returns guestUrl=null; the client assigns that null over the URL prepared at page open.
    // Impact: the specialist loses the only copyable, already-issued patient capability exactly
    // when starting the call and is pushed to an unnecessary invite rotation.
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const preparedUrl = 'https://clinic.therapygo.ru/live#prepared-invite';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...sessionPayload('prepare-room'), guestUrl: preparedUrl }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => sessionPayload('play-room') });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DoctorLiveMeetingClient
        userId="11111111-1111-4111-8111-111111111111"
        appointmentId={null}
        patient={patient}
        encountersEnabled={false}
        medicalRecordEnabled={false}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: /начать звонок/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    fireEvent.click(await screen.findByRole('button', { name: /скопировать ссылку/i }));
    expect(writeText).toHaveBeenCalledWith(preparedUrl);
  });

  it('gives a retryable state without a background retry loop when the prepare request fails', async () => {
    // Failure: a failed prepare call leaves the client either stuck or silently polling forever.
    // Impact: the specialist sees a dead page with no way to recover, or the client hammers the
    // create-or-resume route on an interval no one asked for.
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <DoctorLiveMeetingClient
        userId="11111111-1111-4111-8111-111111111111"
        appointmentId={null}
        patient={patient}
        encountersEnabled={false}
        medicalRecordEnabled={false}
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/не удалось начать звонок/i);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
