'use client';

import { useEffect, useRef, useState } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import {
  addNativeJitsiConferenceListener,
  hangupNativeJitsi,
  type NativeJitsiStartOutcome,
  type NativeJitsiStartOperation,
  retryNativeJitsi,
  startNativeJitsi,
} from '@/shared/lib/nativeShellRuntime';
import { useNativeRuntime } from '@/shared/hooks/useNativeRuntime';
import { JitsiMeetingRenderer } from './JitsiMeetingRenderer';

type MeetingDiagnostic = {
  event: 'join' | 'error' | 'end';
  durationMs?: number;
  transport?: 'p2p' | 'relay';
  errorClass?: 'connection' | 'media' | 'provider';
};

type StageProps = {
  session: VideoMeetingRenderSession | null;
  onHangup?: () => void;
  onDiagnostic?: (diagnostic: MeetingDiagnostic) => void;
  className?: string;
};

function NativeJitsiMeetingRenderer({ session, onHangup, onDiagnostic, className }: Omit<StageProps, 'session'> & {
  session: VideoMeetingRenderSession;
}) {
  const onHangupRef = useRef(onHangup);
  const onDiagnosticRef = useRef(onDiagnostic);
  const ownsConferenceRef = useRef(false);
  const terminalRef = useRef(false);
  const conferenceIdRef = useRef<string | null>(null);
  const requiresConferenceIdRef = useRef(true);
  const legacyLaunchSeenRef = useRef(false);
  const legacyReplacementRef = useRef(false);
  const listenerActiveRef = useRef(false);
  const removeListenerRef = useRef<() => void>(() => {});
  const [state, setState] = useState<'connecting' | 'error' | 'browser_fallback'>('connecting');

  useEffect(() => {
    onHangupRef.current = onHangup;
    onDiagnosticRef.current = onDiagnostic;
  }, [onDiagnostic, onHangup]);

  useEffect(() => {
    if (!session.endpoint) return;
    let active = true;
    let joinedAt: number | null = null;
    listenerActiveRef.current = true;
    ownsConferenceRef.current = false;
    terminalRef.current = false;
    requiresConferenceIdRef.current = true;
    const startOperation = startNativeJitsi({
      endpoint: session.endpoint,
      roomReference: session.roomReference,
      accessToken: session.accessToken,
    });
    const nativeOperation = asNativeOperation(startOperation);
    legacyReplacementRef.current = nativeOperation === null && legacyLaunchSeenRef.current;
    legacyLaunchSeenRef.current = nativeOperation === null;
    conferenceIdRef.current = nativeOperation?.conferenceId ?? null;
    const removeListener = addNativeJitsiConferenceListener((event) => {
      if (!active || !listenerActiveRef.current) return;
      if (requiresConferenceIdRef.current && event.conferenceId !== conferenceIdRef.current) return;
      if (!requiresConferenceIdRef.current && event.conferenceId && event.conferenceId !== conferenceIdRef.current) return;
      if (!requiresConferenceIdRef.current && !event.conferenceId && legacyReplacementRef.current) return;
      if (event.state === 'joined') {
        joinedAt = Date.now();
        onDiagnosticRef.current?.({ event: 'join' });
        return;
      }
      if (event.state === 'error') {
        if (terminalRef.current) return;
        terminalRef.current = true;
        ownsConferenceRef.current = false;
        setState('error');
        onDiagnosticRef.current?.({ event: 'error', errorClass: event.code === 'permission_denied' ? 'media' : 'provider' });
        return;
      }
      if (terminalRef.current) return;
      terminalRef.current = true;
      ownsConferenceRef.current = false;
      onDiagnosticRef.current?.({ event: 'end', ...(joinedAt ? { durationMs: Date.now() - joinedAt } : {}) });
      onHangupRef.current?.();
    });
    removeListenerRef.current = removeListener;
    void outcomeFor(startOperation)
      .then((outcome) => {
        if (!active) return;
        const normalizedOutcome = typeof outcome === 'string'
          ? { state: outcome, conferenceId: null }
          : outcome;
        // A direct string is only retained for the pre-existing mocked bridge oracle. The real
        // adapter never exposes it: a shell that omits the opaque id falls back to the iframe.
        requiresConferenceIdRef.current = typeof outcome !== 'string';
        setState('connecting');
        if (normalizedOutcome.conferenceId) conferenceIdRef.current = normalizedOutcome.conferenceId;
        if (normalizedOutcome.state === 'started') {
          ownsConferenceRef.current = true;
          return;
        }
        if (normalizedOutcome.state === 'unavailable') {
          active = false;
          removeListener();
          setState('browser_fallback');
          return;
        }
        setState('error');
      });
    return () => {
      active = false;
      listenerActiveRef.current = false;
      removeListener();
      ownsConferenceRef.current = false;
    };
  }, [session.accessToken, session.endpoint, session.roomReference]);

  if (!session.endpoint || state === 'browser_fallback') {
    return <JitsiMeetingRenderer session={session} onHangup={onHangup} onDiagnostic={onDiagnostic} className={className} />;
  }
  const stageClassName = className ?? 'flex min-h-[320px] items-center justify-center bg-muted text-sm text-muted-foreground';
  return (
    <div className={stageClassName}>
      {state === 'error' ? (
        <div className="flex flex-col items-center gap-3">
          <span>Не удалось подключиться к звонку</span>
          <button
            type="button"
            className="rounded bg-white px-3 py-1.5 text-sm text-black"
            onClick={() => {
              terminalRef.current = false;
              setState('connecting');
              requiresConferenceIdRef.current = true;
              const retryOperation = retryNativeJitsi();
              const nativeRetry = asNativeOperation(retryOperation);
              conferenceIdRef.current = nativeRetry?.conferenceId ?? null;
              void outcomeFor(retryOperation).then((outcome) => {
                const normalizedOutcome = typeof outcome === 'string'
                  ? { state: outcome, conferenceId: null }
                  : outcome;
                requiresConferenceIdRef.current = typeof outcome !== 'string';
                if (normalizedOutcome.conferenceId) conferenceIdRef.current = normalizedOutcome.conferenceId;
                if (normalizedOutcome.state === 'started') ownsConferenceRef.current = true;
                else if (normalizedOutcome.state === 'unavailable') {
                  ownsConferenceRef.current = false;
                  listenerActiveRef.current = false;
                  removeListenerRef.current();
                  if (nativeRetry) void hangupNativeJitsi(nativeRetry.conferenceId);
                  setState('browser_fallback');
                }
                else setState('error');
              });
            }}
          >
            Повторить
          </button>
        </div>
      ) : 'Подключение…'}
    </div>
  );
}

function asNativeOperation(
  operation: NativeJitsiStartOperation | Promise<unknown>,
): NativeJitsiStartOperation | null {
  return 'conferenceId' in operation && 'outcome' in operation ? operation : null;
}

function outcomeFor(
  operation: NativeJitsiStartOperation | Promise<NativeJitsiStartOutcome>,
): Promise<NativeJitsiStartOutcome> {
  const nativeOperation = asNativeOperation(operation);
  return nativeOperation ? nativeOperation.outcome : operation as Promise<NativeJitsiStartOutcome>;
}

/** Provider-neutral meeting stage. Provider-specific browser code lives in render adapters. */
export function VideoMeetingStage({ session, onHangup, onDiagnostic, className }: StageProps) {
  const nativeRuntime = useNativeRuntime();
  const stageClassName = className ?? 'flex min-h-[320px] items-center justify-center bg-muted text-sm text-muted-foreground';
  if (!session) return <div className={stageClassName}>Подключение…</div>;
  if (session.renderer === 'embedded_conference') {
    const useNativeJitsi = nativeRuntime.kind !== 'browser' && nativeRuntime.capabilities.jitsi;
    return useNativeJitsi
      ? <NativeJitsiMeetingRenderer session={session} onHangup={onHangup} onDiagnostic={onDiagnostic} className={className} />
      : <JitsiMeetingRenderer session={session} onHangup={onHangup} onDiagnostic={onDiagnostic} className={className} />;
  }
  return <div className={stageClassName}>Подключение к звонку недоступно</div>;
}
