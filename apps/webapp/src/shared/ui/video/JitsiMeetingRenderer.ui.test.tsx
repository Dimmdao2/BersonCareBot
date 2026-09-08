import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    document
      .querySelectorAll('script[src="https://meet.example.test/external_api.js"]')
      .forEach((script) => script.remove());
    vi.restoreAllMocks();
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

  it('joins without Jitsi prejoin', async () => {
    render(<JitsiMeetingRenderer session={session} />);
    await Promise.resolve();

    const options = construct.mock.calls[0]?.[1] as {
      configOverwrite?: { prejoinConfig?: { enabled?: boolean } };
    };
    expect(options.configOverwrite?.prejoinConfig?.enabled).toBe(false);
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
  });

  it('retries after a failed bundle load instead of leaving the next call connecting forever', async () => {
    delete (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
    const first = render(<JitsiMeetingRenderer session={session} />);
    const failedScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://meet.example.test/external_api.js"]',
    );
    expect(failedScript).not.toBeNull();
    failedScript?.dispatchEvent(new Event('error'));
    await waitFor(() =>
      expect(screen.getByText('Не удалось подключиться к звонку')).toBeInTheDocument(),
    );
    first.unmount();

    render(<JitsiMeetingRenderer session={session} />);
    const retryScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://meet.example.test/external_api.js"]',
    );
    expect(retryScript).not.toBeNull();
    expect(retryScript).not.toBe(failedScript);
    retryScript?.dispatchEvent(new Event('error'));
    await waitFor(() =>
      expect(screen.getByText('Не удалось подключиться к звонку')).toBeInTheDocument(),
    );
  });

  it('hands connecting and error presentation to Jitsi as soon as its iframe is initialized', async () => {
    render(<JitsiMeetingRenderer session={session} />);
    await waitFor(() => expect(screen.queryByText('Подключение…')).not.toBeInTheDocument());
  });

  /**
   * VM-10 (owner-correction 08.09.2026): "Ошибка загрузки Jitsi bundle сразу переводит stage из
   * «Подключение…» в понятное состояние отказа с действием «Повторить»". The failed-load state
   * must offer an in-place retry action, not merely a state a caller can reach by unmounting and
   * remounting the whole component from outside.
   */
  it('offers a working Повторить action after a failed bundle load, without requiring an external remount', async () => {
    // Failure: the failure state shows only text with no retry control, so the only way to try
    // again is for a page-level ancestor to unmount and remount this component (or reload the
    // whole page) — there is no in-place recovery the specialist can act on.
    // Impact: a transient script load failure permanently strands the specialist on a dead call
    // screen unless they navigate away and back.
    delete (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
    render(<JitsiMeetingRenderer session={session} />);
    const failedScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://meet.example.test/external_api.js"]',
    );
    failedScript?.dispatchEvent(new Event('error'));
    await waitFor(() =>
      expect(screen.getByText('Не удалось подключиться к звонку')).toBeInTheDocument(),
    );

    const retryButton = await screen.findByRole('button', { name: /повторить/i });
    retryButton.click();

    await waitFor(() => expect(screen.getByText('Подключение…')).toBeInTheDocument());
    const retryScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://meet.example.test/external_api.js"]',
    );
    expect(retryScript).not.toBeNull();
    expect(retryScript).not.toBe(failedScript);
  });

  /**
   * VM-10: "Произвольный общий deadline не объявляет рабочую медленную загрузку ошибкой: таймер,
   * если используется, только показывает нефатальное сообщение о долгой загрузке и доступный
   * retry." A slow-but-otherwise-healthy load (no browser `error` event) must not be forced into
   * the same hard failure branch as a genuine script error before the script itself ever settles.
   */
  it('does not treat a merely slow bundle load as a hard failure before any browser error event', async () => {
    // Failure: a fixed client-side timer fires `failed()` on the same path as a genuine `error`
    // event — removing the still-loading script and flipping to the hard "unavailable" state —
    // even though the script never actually errored and may still load successfully.
    // Impact: specialists on a slow network are told the call failed and lose the in-flight load,
    // even though nothing was actually broken.
    vi.useFakeTimers();
    try {
      delete (window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI;
      render(<JitsiMeetingRenderer session={session} />);
      const script = document.querySelector<HTMLScriptElement>(
        'script[src="https://meet.example.test/external_api.js"]',
      );
      expect(script).not.toBeNull();

      await vi.advanceTimersByTimeAsync(20_000);

      expect(screen.queryByText('Не удалось подключиться к звонку')).not.toBeInTheDocument();
      expect(
        document.querySelector('script[src="https://meet.example.test/external_api.js"]'),
      ).toBe(script);
    } finally {
      vi.useRealTimers();
    }
  });
});
