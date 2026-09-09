'use client';

import { useEffect, useRef, useState } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';

type JitsiApi = {
  dispose: () => void;
  addEventListener: (event: string, listener: (payload?: unknown) => void) => void;
  executeCommand: (command: string, ...arguments_: unknown[]) => void;
};
type JitsiConstructor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

function scriptUrl(endpoint: string): string {
  return `${endpoint.replace(/\/$/, '')}/external_api.js`;
}

function errorClassFromJitsiEvent(payload: unknown): 'connection' | 'media' | 'provider' {
  if (!payload || typeof payload !== 'object') return 'provider';
  const details = payload as Record<string, unknown>;
  const value = [details.name, details.type, details.error]
    .find((candidate): candidate is string => typeof candidate === 'string')
    ?.toLowerCase() ?? '';
  if (/(camera|mic|media|device|permission)/.test(value)) return 'media';
  if (/(connection|network|ice|conference)/.test(value)) return 'connection';
  return 'provider';
}

function transportFromP2pStatus(payload: unknown): 'p2p' | 'relay' | null {
  if (!payload || typeof payload !== 'object') return null;
  const isP2p = (payload as Record<string, unknown>).isP2p;
  if (typeof isP2p !== 'boolean') return null;
  return isP2p ? 'p2p' : 'relay';
}

async function loadJitsi(endpoint: string): Promise<JitsiConstructor> {
  if (window.JitsiMeetExternalAPI) return window.JitsiMeetExternalAPI;
  const src = scriptUrl(endpoint);
  let existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.bcbJitsiLoadState === 'failed') {
    existing.remove();
    existing = null;
  }
  const script = existing ?? document.createElement('script');
  const ready = new Promise<JitsiConstructor>((resolve, reject) => {
    let settled = false;
    const finish = (constructor?: JitsiConstructor) => {
      if (settled) return;
      settled = true;
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
      if (constructor) {
        script.dataset.bcbJitsiLoadState = 'loaded';
        resolve(constructor);
        return;
      }
      script.dataset.bcbJitsiLoadState = 'failed';
      script.remove();
      reject(new Error('unavailable'));
    };
    const loaded = () => finish(window.JitsiMeetExternalAPI);
    const failed = () => finish();
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
  });
  if (!existing) {
    script.dataset.bcbJitsiLoadState = 'loading';
    script.src = src;
    script.async = true;
    document.head.append(script);
  }
  return ready;
}

/** The only Jitsi-aware browser adapter; it is selected by the neutral render descriptor. */
export function JitsiMeetingRenderer({
  session,
  onHangup,
  onDiagnostic,
  className,
}: {
  session: VideoMeetingRenderSession;
  onHangup?: () => void;
  onDiagnostic?: (diagnostic: { event: 'join' | 'error' | 'end'; durationMs?: number; transport?: 'p2p' | 'relay'; errorClass?: 'connection' | 'media' | 'provider' }) => void;
  className?: string;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const onHangupRef = useRef(onHangup);
  const onDiagnosticRef = useRef(onDiagnostic);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [retryNonce, setRetryNonce] = useState(0);
  onHangupRef.current = onHangup;
  onDiagnosticRef.current = onDiagnostic;
  const endpoint = session.endpoint;
  const roomReference = session.roomReference;

  useEffect(() => {
    if (!endpoint || !targetRef.current) {
      setState('unavailable');
      return;
    }
    let disposed = false;
    let terminal = false;
    let joinedAt: number | null = null;
    setState('loading');
    void loadJitsi(endpoint)
      .then((JitsiMeetExternalAPI) => {
        if (disposed || !targetRef.current) return;
        const api = new JitsiMeetExternalAPI(new URL(endpoint).host, {
          parentNode: targetRef.current,
          roomName: roomReference,
          jwt: session.accessToken,
          configOverwrite: {
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            enableWelcomePage: false,
            hideConferenceSubject: true,
            // Jitsi falls back to the opaque room id when no subject exists. Keep a neutral
            // product label as a second line of defence for clients that still render it.
            subject: 'Видеовстреча',
            localSubject: 'Видеовстреча',
          },
          interfaceConfigOverwrite: {
            // The deployment configuration is the broad allowlist. iframe overrides only narrow
            // it to controls exposed by the pinned External API bundle.
            TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup', 'desktop', 'toggle-camera', 'fullscreen', 'settings', 'tileview', 'videoquality', 'select-background'],
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
          },
        });
        apiRef.current = api;
        const endConference = () => {
          if (disposed || terminal) return;
          terminal = true;
          onDiagnosticRef.current?.({ event: 'end', ...(joinedAt ? { durationMs: Date.now() - joinedAt } : {}) });
          onHangupRef.current?.();
        };
        const remoteParticipants = new Set<string>();
        let filmstripVisible = true;
        const setFilmstripVisible = (visible: boolean) => {
          if (filmstripVisible === visible) return;
          filmstripVisible = visible;
          api.executeCommand('toggleFilmStrip');
        };
        api.addEventListener('videoConferenceJoined', () => {
          joinedAt = Date.now();
          if (remoteParticipants.size === 0) setFilmstripVisible(false);
          onDiagnosticRef.current?.({ event: 'join' });
        });
        api.addEventListener('filmstripDisplayChanged', (payload) => {
          if (!payload || typeof payload !== 'object') return;
          const visible = (payload as Record<string, unknown>).visible;
          if (typeof visible === 'boolean') filmstripVisible = visible;
        });
        api.addEventListener('participantJoined', (payload) => {
          if (payload && typeof payload === 'object') {
            const id = (payload as Record<string, unknown>).id;
            if (typeof id === 'string') remoteParticipants.add(id);
          }
          setFilmstripVisible(true);
        });
        api.addEventListener('participantLeft', (payload) => {
          if (payload && typeof payload === 'object') {
            const id = (payload as Record<string, unknown>).id;
            if (typeof id === 'string') remoteParticipants.delete(id);
          }
          if (remoteParticipants.size === 0) setFilmstripVisible(false);
        });
        api.addEventListener('errorOccurred', (payload) => {
          onDiagnosticRef.current?.({ event: 'error', errorClass: errorClassFromJitsiEvent(payload) });
        });
        api.addEventListener('p2pStatusChanged', (payload) => {
          const transport = transportFromP2pStatus(payload);
          if (transport) onDiagnosticRef.current?.({ event: 'join', transport });
        });
        api.addEventListener('cameraError', () => onDiagnosticRef.current?.({ event: 'error', errorClass: 'media' }));
        api.addEventListener('micError', () => onDiagnosticRef.current?.({ event: 'error', errorClass: 'media' }));
        api.addEventListener('videoConferenceLeft', endConference);
        api.addEventListener('readyToClose', endConference);
        // Once Jitsi owns the iframe it must also own the connecting/error UI. Waiting for a
        // conference event here can permanently cover an already-rendering call when the automatic
        // join outruns External API listener registration.
        setState('ready');
      })
      .catch(() => {
        if (!disposed) setState('unavailable');
      });
    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // Token renewal is in-memory; dispose only when this joined room or its endpoint is replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, roomReference, retryNonce]);

  return (
    <div className={className ?? 'relative min-h-[320px] bg-black'}>
      <div ref={targetRef} className={className ? 'h-full w-full' : 'min-h-[320px] w-full'} />
      {state !== 'ready' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
          {state === 'unavailable' ? (
            <div className="flex flex-col items-center gap-3">
              <span>Не удалось подключиться к звонку</span>
              <button
                type="button"
                className="rounded bg-white px-3 py-1.5 text-sm text-black"
                onClick={() => setRetryNonce((value) => value + 1)}
              >
                Повторить
              </button>
            </div>
          ) : 'Подключение…'}
        </div>
      ) : null}
    </div>
  );
}
