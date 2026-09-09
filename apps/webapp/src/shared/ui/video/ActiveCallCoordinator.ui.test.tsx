import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { ActiveCallCoordinator, useActiveCall } from './ActiveCallCoordinator';

const navigation = vi.hoisted(() => ({ pathname: '/app/patient/live/a' }));
const stage = vi.hoisted(() => ({ current: null as {
  session: VideoMeetingRenderSession | null;
  onHangup?: () => void;
  className?: string;
} | null }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock('@/shared/hooks/usePlatform', () => ({
  usePlatform: () => 'therapygo_android',
}));

vi.mock('./VideoMeetingStage', () => ({
  VideoMeetingStage: (props: {
    session: VideoMeetingRenderSession | null;
    onHangup?: () => void;
    className?: string;
  }) => {
    stage.current = props;
    return <div data-testid="meeting-stage" data-room={props.session?.roomReference} data-class={props.className} />;
  },
}));

const session = (roomReference: string): VideoMeetingRenderSession => ({
  renderer: 'embedded_conference',
  endpoint: 'https://meet.therapysto.test',
  roomReference,
  accessToken: `token-${roomReference}`,
  expiresAt: '2099-09-09T12:00:00.000Z',
});

function Probe({ onTerminal }: { onTerminal: () => void }) {
  const activeCall = useActiveCall();
  return (
    <>
      <button type="button" onClick={() => activeCall.activate({ session: session('room-a'), returnUrl: '/app/patient/live/a?visit=one', onTerminal })}>start A</button>
      <button type="button" onClick={() => activeCall.activate({ session: session('room-b'), returnUrl: '/app/patient/live/b?visit=two', onTerminal })}>start B</button>
      <output data-testid="active-room">{activeCall.activeCall?.session.roomReference ?? 'none'}</output>
      <output data-testid="return-url">{activeCall.activeCall?.returnUrl ?? 'none'}</output>
      <output data-testid="active-route">{String(activeCall.isActiveRoute)}</output>
    </>
  );
}

function renderCoordinator(onTerminal = vi.fn()) {
  return {
    onTerminal,
    ...render(
      <ActiveCallCoordinator floatingIndicator={<div data-testid="return-indicator" />}>
        <Probe onTerminal={onTerminal} />
      </ActiveCallCoordinator>,
    ),
  };
}

describe('ActiveCallCoordinator mobile lifecycle (M4-04/M4-06)', () => {
  beforeEach(() => {
    navigation.pathname = '/app/patient/live/a';
    stage.current = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps A mounted and rejects an ordinary B start after route navigation', () => {
    // Failure: leaving A drops its one coordinator owner, or a later normal start replaces it.
    // Impact: users silently lose a live consultation or join a second conference despite the
    // owner rule that ordinary UI cannot start another call while one is active.
    const view = renderCoordinator();
    fireEvent.click(screen.getByRole('button', { name: 'start A' }));
    expect(screen.getByTestId('meeting-stage')).toHaveAttribute('data-room', 'room-a');

    navigation.pathname = '/app/patient/program';
    view.rerender(
      <ActiveCallCoordinator floatingIndicator={<div data-testid="return-indicator" />}>
        <Probe onTerminal={view.onTerminal} />
      </ActiveCallCoordinator>,
    );
    expect(screen.getByTestId('meeting-stage')).toHaveAttribute('data-room', 'room-a');
    expect(screen.getByTestId('return-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('return-url')).toHaveTextContent('/app/patient/live/a?visit=one');

    fireEvent.click(screen.getByRole('button', { name: 'start B' }));
    expect(screen.getByTestId('active-room')).toHaveTextContent('room-a');
    expect(screen.getByTestId('meeting-stage')).toHaveAttribute('data-room', 'room-a');
  });

  it('clears one active call and runs its terminal callback once when the renderer redelivers end', () => {
    // Failure: duplicate native/browser terminal delivery clears the shell twice and repeats the
    // existing encounter end callback. Impact: duplicate end mutations after the origin route
    // has already unmounted are silent and can corrupt the consultation lifecycle.
    const { onTerminal } = renderCoordinator();
    fireEvent.click(screen.getByRole('button', { name: 'start A' }));
    expect(stage.current?.onHangup).toBeTypeOf('function');

    act(() => {
      stage.current?.onHangup?.();
      stage.current?.onHangup?.();
    });

    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('active-room')).toHaveTextContent('none');
    expect(screen.queryByTestId('meeting-stage')).not.toBeInTheDocument();
  });
});
