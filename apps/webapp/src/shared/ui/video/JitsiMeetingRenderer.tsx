'use client';

import { useEffect, useRef, useState } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';

type JitsiApi = {
  dispose: () => void;
  addEventListener: (event: string, listener: () => void) => void;
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
}: {
  session: VideoMeetingRenderSession;
  onHangup?: () => void;
  onDiagnostic?: (diagnostic: { event: 'join' | 'error' | 'end'; durationMs?: number; transport?: 'p2p' | 'relay'; errorClass?: 'connection' | 'media' | 'provider' }) => void;
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
            disableConferenceSubject: true,
          },
          interfaceConfigOverwrite: {
            // The deployment configuration is the broad allowlist. iframe overrides only narrow
            // it to controls exposed by the pinned External API bundle.
            TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup', 'desktop', 'toggle-camera', 'fullscreen', 'settings', 'filmstrip', 'tileview', 'videoquality', 'select-background'],
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
          },
        });
        apiRef.current = api;
        api.addEventListener('videoConferenceJoined', () => {
          joinedAt = Date.now();
          onDiagnosticRef.current?.({ event: 'join' });
        });
        api.addEventListener('conferenceError', () => onDiagnosticRef.current?.({ event: 'error', errorClass: 'provider' }));
        api.addEventListener('readyToClose', () => {
          onDiagnosticRef.current?.({ event: 'end', ...(joinedAt ? { durationMs: Date.now() - joinedAt } : {}) });
          onHangupRef.current?.();
        });
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
    <div className="relative min-h-[320px] bg-black">
      <div ref={targetRef} className="min-h-[320px] w-full" />
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
