'use client';

import { useEffect, useRef, useState } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';

type JitsiApi = {
  dispose: () => void;
  addEventListener: (event: string, listener: () => void) => void;
  getNumberOfParticipants?: () => number;
};
type JitsiConstructor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

declare global { interface Window { JitsiMeetExternalAPI?: JitsiConstructor } }

function scriptUrl(endpoint: string): string { return `${endpoint.replace(/\/$/, '')}/external_api.js`; }

async function loadJitsi(endpoint: string): Promise<JitsiConstructor> {
  if (window.JitsiMeetExternalAPI) return window.JitsiMeetExternalAPI;
  const src = scriptUrl(endpoint);
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  const script = existing ?? document.createElement('script');
  const ready = new Promise<JitsiConstructor>((resolve, reject) => {
    script.addEventListener('load', () => window.JitsiMeetExternalAPI ? resolve(window.JitsiMeetExternalAPI) : reject(new Error('unavailable')), { once: true });
    script.addEventListener('error', () => reject(new Error('unavailable')), { once: true });
  });
  if (!existing) { script.src = src; script.async = true; document.head.append(script); }
  return ready;
}

/** The only Jitsi-aware browser adapter; it is selected by the neutral render descriptor. */
export function JitsiMeetingRenderer({ session, onHangup }: { session: VideoMeetingRenderSession; onHangup?: () => void }) {
  const targetRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const onHangupRef = useRef(onHangup);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  onHangupRef.current = onHangup;
  const endpoint = session.endpoint;
  const roomReference = session.roomReference;

  useEffect(() => {
    if (!endpoint || !targetRef.current) { setState('unavailable'); return; }
    let disposed = false;
    let readinessTimer: ReturnType<typeof setInterval> | null = null;
    setState('loading');
    void loadJitsi(endpoint).then((JitsiMeetExternalAPI) => {
      if (disposed || !targetRef.current) return;
      const api = new JitsiMeetExternalAPI(new URL(endpoint).host, {
        parentNode: targetRef.current, roomName: roomReference, jwt: session.accessToken,
        configOverwrite: {
          prejoinConfig: { enabled: false },
          disableDeepLinking: true,
          enableWelcomePage: false,
        },
        interfaceConfigOverwrite: { TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup'], SHOW_JITSI_WATERMARK: false, SHOW_BRAND_WATERMARK: false, SHOW_POWERED_BY: false },
      });
      apiRef.current = api;
      api.addEventListener('videoConferenceJoined', () => { if (!disposed) setState('ready'); });
      api.addEventListener('readyToClose', () => onHangupRef.current?.());
      // With prejoin disabled, current Jitsi can join before External API delivers the joined event.
      // The public participant-count command is a stable secondary signal that the local participant exists.
      readinessTimer = setInterval(() => {
        if (!disposed && (api.getNumberOfParticipants?.() ?? 0) > 0) {
          setState('ready');
          if (readinessTimer) clearInterval(readinessTimer);
          readinessTimer = null;
        }
      }, 250);
    }).catch(() => { if (!disposed) setState('unavailable'); });
    return () => {
      disposed = true;
      if (readinessTimer) clearInterval(readinessTimer);
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // Token renewal is in-memory; dispose only when this joined room or its endpoint is replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, roomReference]);

  return <div className="relative min-h-[320px] bg-black"><div ref={targetRef} className="min-h-[320px] w-full" />{state !== 'ready' ? <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">{state === 'unavailable' ? 'Не удалось подключиться к звонку' : 'Подключение…'}</div> : null}</div>;
}
