import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { JitsiMeetingRenderer } from './JitsiMeetingRenderer';

const session = {
  renderer: 'embedded_conference' as const,
  endpoint: 'https://meet.example.test',
  roomReference: 'room-ref',
  accessToken: 'token',
  expiresAt: '2099-09-08T02:00:00.000Z',
};

/**
 * NOTE-08: the right-hand panel is worked in while the call runs — autosave, collapsing a
 * neighbouring note and switching tabs all re-render the live page. None of that may take the
 * conference down.
 */
describe('meeting renderer survives unrelated re-renders (NOTE-08)', () => {
  const construct = vi.fn();

  beforeEach(() => {
    construct.mockClear();
    class FakeApi {
      constructor(domain: string, options: Record<string, unknown>) {
        construct(domain, options);
      }
      dispose = vi.fn();
      addEventListener = vi.fn();
    }
    (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI = FakeApi;
  });

  afterEach(() => {
    delete (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
  });

  it('does not rebuild the conference when the parent re-renders with a new callback identity', async () => {
    // Failure: the effect that creates the conference also depends on the parent's callback, so
    // every keystroke-driven autosave re-render of the live page disposes the running call and
    // joins the room again.
    // Impact: the call drops repeatedly in the middle of a consultation while the specialist
    // types the note, and nothing in the UI explains why.
    const { rerender } = render(
      <JitsiMeetingRenderer session={session} onHangup={() => undefined} />,
    );
    await Promise.resolve();
    expect(construct).toHaveBeenCalledTimes(1);

    rerender(<JitsiMeetingRenderer session={session} onHangup={() => undefined} />);
    rerender(<JitsiMeetingRenderer session={{ ...session }} onHangup={() => undefined} />);
    await Promise.resolve();

    expect(construct).toHaveBeenCalledTimes(1);
  });

  it('offers only microphone, camera and hangup and no Jitsi branding', async () => {
    // Failure: the embedded conference exposes its own toolbar/branding, so the product screen
    // turns back into a Jitsi meeting with chat, invite, recording and watermarks (VM-06).
    render(<JitsiMeetingRenderer session={session} />);
    await Promise.resolve();

    const options = construct.mock.calls[0]?.[1] as {
      interfaceConfigOverwrite?: { TOOLBAR_BUTTONS?: string[] };
    };
    expect(options.interfaceConfigOverwrite?.TOOLBAR_BUTTONS).toEqual([
      'microphone',
      'camera',
      'hangup',
    ]);
  });

  it('loads its browser bundle only from the endpoint the session names', async () => {
    // Failure: the adapter falls back to a public Jitsi origin, so a self-hosted-only product
    // silently fetches code from meet.jit.si / 8x8 (VM-01/VM-04).
    delete (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
    const appended: string[] = [];
    const realAppend = document.head.append.bind(document.head);
    vi.spyOn(document.head, 'append').mockImplementation((...nodes: unknown[]) => {
      for (const node of nodes) {
        if (node instanceof HTMLScriptElement) appended.push(node.src);
      }
      return realAppend(...(nodes as Node[]));
    });

    render(<JitsiMeetingRenderer session={session} />);
    await Promise.resolve();

    expect(appended).toEqual(['https://meet.example.test/external_api.js']);
    vi.restoreAllMocks();
  });
});
