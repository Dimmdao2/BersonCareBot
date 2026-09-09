import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import type { NativeRuntimeSnapshot } from '@/shared/lib/platform';
import { VideoMeetingStage } from './VideoMeetingStage';

type NativeConferenceEvent =
  | { state: 'joined'; conferenceId: string }
  | { state: 'terminated'; conferenceId: string }
  | { state: 'error'; code: string | null; conferenceId: string };

const runtime = vi.hoisted(() => ({
  value: {
    kind: 'therapygo_android',
    version: '1.0.0',
    capabilities: { jitsi: true, media: true, push: true },
  } as NativeRuntimeSnapshot,
}));

const nativeBridge = vi.hoisted(() => ({
  start: vi.fn(),
  retry: vi.fn(),
  hangup: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock('@/shared/hooks/useNativeRuntime', () => ({
  useNativeRuntime: () => runtime.value,
}));

vi.mock('@/shared/lib/nativeShellRuntime', () => ({
  startNativeJitsi: nativeBridge.start,
  retryNativeJitsi: nativeBridge.retry,
  hangupNativeJitsi: nativeBridge.hangup,
  addNativeJitsiConferenceListener: nativeBridge.addListener,
}));

const session = (roomReference = 'room-one'): VideoMeetingRenderSession => ({
  renderer: 'embedded_conference',
  endpoint: 'https://meet.therapysto.test',
  roomReference,
  accessToken: `authorized-token-${roomReference}`,
  expiresAt: '2099-09-09T12:00:00.000Z',
});

describe('VideoMeetingStage native Jitsi seam (M4-01/M4-04/M4-05)', () => {
  let listeners: Array<(event: NativeConferenceEvent) => void>;
  let launchIds: string[];
  let nextLaunch: number;

  function startedOperation() {
    const conferenceId = `conference-${String(nextLaunch++).padStart(6, '0')}`;
    launchIds.push(conferenceId);
    return {
      conferenceId,
      outcome: Promise.resolve({ state: 'started' as const, conferenceId }),
    };
  }

  beforeEach(() => {
    listeners = [];
    launchIds = [];
    nextLaunch = 1;
    runtime.value = {
      kind: 'therapygo_android',
      version: '1.0.0',
      capabilities: { jitsi: true, media: true, push: true },
    } satisfies NativeRuntimeSnapshot;
    nativeBridge.start.mockImplementation(startedOperation);
    nativeBridge.retry.mockImplementation(startedOperation);
    nativeBridge.hangup.mockResolvedValue(undefined);
    nativeBridge.addListener.mockImplementation((listener: (event: NativeConferenceEvent) => void) => {
      listeners.push(listener);
      return () => undefined;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens the authorized session through the native stage only for a trusted capable Android runtime', async () => {
    // Failure: a native-capable Android runtime receives a browser iframe, or native open gets
    // altered room material. Impact: the authorized caller either leaves the app or joins a
    // different conference; neither failure changes server authorization or necessarily crashes.
    const authorizedSession = session();
    render(<VideoMeetingStage session={authorizedSession} />);

    await waitFor(() =>
      expect(nativeBridge.start).toHaveBeenCalledWith({
        endpoint: authorizedSession.endpoint,
        roomReference: authorizedSession.roomReference,
        accessToken: authorizedSession.accessToken,
      }),
    );
  });

  it('falls back to the retained browser renderer when native open is unavailable', async () => {
    // Failure: a stale/missing/rejecting native bridge leaves a capable-looking Android shell on
    // a blank stage instead of preserving the browser/PWA conference behavior.
    nativeBridge.start.mockReturnValueOnce(
      Promise.resolve({ state: 'unavailable' as const, conferenceId: null }),
    );
    const construct = vi.fn();
    class FakeJitsiApi {
      dispose = vi.fn();
      addEventListener = vi.fn();
      executeCommand = vi.fn();
      constructor(domain: string, options: Record<string, unknown>) {
        construct(domain, options);
      }
    }
    (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI = FakeJitsiApi;

    render(<VideoMeetingStage session={session()} />);

    await waitFor(() => expect(construct).toHaveBeenCalledWith('meet.therapysto.test', expect.any(Object)));
    delete (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
  });

  it('keeps the browser/PWA renderer when runtime capability is unavailable', async () => {
    // Failure: a browser or PWA is routed into the Android-only renderer. Impact: ordinary web
    // callers lose their iframe conference even though their authorized session is unchanged.
    runtime.value = {
      kind: 'browser',
      version: null,
      capabilities: { jitsi: false, media: false, push: false },
    };
    const construct = vi.fn();
    class FakeJitsiApi {
      dispose = vi.fn();
      addEventListener = vi.fn();
      executeCommand = vi.fn();
      constructor(domain: string, options: Record<string, unknown>) {
        construct(domain, options);
      }
    }
    (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI = FakeJitsiApi;

    render(<VideoMeetingStage session={session()} />);

    await waitFor(() => expect(construct).toHaveBeenCalledWith('meet.therapysto.test', expect.any(Object)));
    expect(nativeBridge.start).not.toHaveBeenCalled();
    delete (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
  });

  it('keeps one terminal transition when a native conference redelivers termination', async () => {
    // Failure: duplicate terminal delivery runs the existing hangup path twice. Impact: the
    // specialist can send duplicate end/diagnostic actions while returning to the notes surface.
    const onHangup = vi.fn();
    const onDiagnostic = vi.fn();
    render(<VideoMeetingStage session={session()} onHangup={onHangup} onDiagnostic={onDiagnostic} />);
    await waitFor(() => expect(listeners).toHaveLength(1));

    const conferenceId = launchIds[0]!;
    listeners[0]?.({ state: 'joined', conferenceId });
    listeners[0]?.({ state: 'terminated', conferenceId });
    listeners[0]?.({ state: 'terminated', conferenceId });

    await waitFor(() => expect(onHangup).toHaveBeenCalledTimes(1));
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ event: 'end' }));
  });

  it('maps an error terminal event to one existing diagnostic', async () => {
    // Failure: a native error is swallowed or repeated. Impact: a failed conference has neither
    // the existing operational diagnostic, leaving the product without its provider-error trace.
    const onDiagnostic = vi.fn();
    render(<VideoMeetingStage session={session()} onDiagnostic={onDiagnostic} />);
    await waitFor(() => expect(listeners).toHaveLength(1));

    const conferenceId = launchIds[0]!;
    listeners[0]?.({ state: 'error', code: 'permission_denied', conferenceId });
    listeners[0]?.({ state: 'error', code: 'permission_denied', conferenceId });

    await waitFor(() => expect(onDiagnostic).toHaveBeenCalledTimes(1));
    expect(onDiagnostic).toHaveBeenCalledWith({ event: 'error', errorClass: 'media' });
  });

  it('does not let a late terminal event from the replaced room end the new room', async () => {
    // Failure: after the caller replaces room A with authorized room B, a terminal event emitted
    // by Activity A reaches B's active bridge listener. Impact: a user who has already entered B
    // is ejected back to the existing notes/hangup path by an old conference.
    const onHangup = vi.fn();
    const firstSession = session('room-one');
    const secondSession = session('room-two');
    const view = render(<VideoMeetingStage session={firstSession} onHangup={onHangup} />);
    await waitFor(() => expect(listeners).toHaveLength(1));

    view.rerender(<VideoMeetingStage session={secondSession} onHangup={onHangup} />);
    await waitFor(() => expect(listeners).toHaveLength(2));

    // Activity A's late terminal broadcast carries A's opaque launch id and must not own B.
    listeners[1]?.({ state: 'terminated', conferenceId: launchIds[0]! });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onHangup).not.toHaveBeenCalled();
  });
});
