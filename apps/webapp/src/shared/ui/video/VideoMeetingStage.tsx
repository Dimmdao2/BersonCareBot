'use client';

import { useEffect, useRef, useState } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import {
  addNativeJitsiConferenceListener,
  hangupNativeJitsi,
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
  const replacedConferenceRef = useRef(false);
  const previousSessionRef = useRef<Pick<VideoMeetingRenderSession, 'endpoint' | 'roomReference' | 'accessToken'> | null>(null);
  const [state, setState] = useState<'connecting' | 'error' | 'browser_fallback'>('connecting');

  useEffect(() => {
    onHangupRef.current = onHangup;
    onDiagnosticRef.current = onDiagnostic;
  }, [onDiagnostic, onHangup]);

  useEffect(() => {
    if (!session.endpoint) return;
    let active = true;
    let joinedAt: number | null = null;
    const previousSession = previousSessionRef.current;
    if (
      previousSession &&
      (previousSession.endpoint !== session.endpoint ||
        previousSession.roomReference !== session.roomReference ||
        previousSession.accessToken !== session.accessToken)
    ) {
      replacedConferenceRef.current = true;
    }
    previousSessionRef.current = {
      endpoint: session.endpoint,
      roomReference: session.roomReference,
      accessToken: session.accessToken,
    };
    ownsConferenceRef.current = false;
    terminalRef.current = false;
    conferenceIdRef.current = null;
    const removeListener = addNativeJitsiConferenceListener((event) => {
      if (!active) return;
      // The Android bridge tags real launches. Once a stage has replaced a conference, an untagged
      // legacy broadcast has no ownership proof and cannot be allowed to terminate the replacement.
      if (conferenceIdRef.current ? event.conferenceId !== conferenceIdRef.current : replacedConferenceRef.current) return;
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
    void startNativeJitsi({ endpoint: session.endpoint, roomReference: session.roomReference, accessToken: session.accessToken })
      .then((outcome) => {
        if (!active) return;
        const normalizedOutcome = typeof outcome === 'string'
          ? { state: outcome, conferenceId: null }
          : outcome;
        setState('connecting');
        conferenceIdRef.current = normalizedOutcome.conferenceId;
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
      removeListener();
      if (ownsConferenceRef.current) {
        ownsConferenceRef.current = false;
        void hangupNativeJitsi();
      }
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
              void retryNativeJitsi().then((outcome) => {
                const normalizedOutcome = typeof outcome === 'string'
                  ? { state: outcome, conferenceId: null }
                  : outcome;
                conferenceIdRef.current = normalizedOutcome.conferenceId;
                if (normalizedOutcome.state === 'started') ownsConferenceRef.current = true;
                else if (normalizedOutcome.state === 'unavailable') setState('browser_fallback');
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
