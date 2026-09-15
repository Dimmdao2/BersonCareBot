'use client';

import { useEffect, useReducer } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { VideoMeetingStage } from '@/shared/ui/video/VideoMeetingStage';

export function GuestLivePageClient() {
  const [state, dispatch] = useReducer(
    (
      current: { session: VideoMeetingRenderSession | null; refused: boolean },
      event:
        | { type: 'session'; session: VideoMeetingRenderSession }
        | { type: 'refused' },
    ) => (event.type === 'session' ? { session: event.session, refused: false } : { ...current, refused: true }),
    { session: null, refused: false },
  );
  useEffect(() => {
    const bearer = window.location.hash.slice(1);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    if (!bearer) {
      dispatch({ type: 'refused' });
      return;
    }
    void fetch('/api/video-meetings/guest/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearer }) })
      .then(async (response) => ({ response, data: await response.json() as { ok?: boolean; session?: VideoMeetingRenderSession } }))
      .then(({ response, data }) => {
        if (!response.ok || !data.ok || !data.session) { dispatch({ type: 'refused' }); return; }
        dispatch({ type: 'session', session: data.session });
      })
      .catch(() => dispatch({ type: 'refused' }));
  }, []);
  // Звонок занимает весь экран целиком: провайдер растягивает свой iframe на 100% высоты
  // контейнера, поэтому у контейнера должна быть настоящая высота, а не только min-height.
  return state.refused ? (
    <main className="flex min-h-[100dvh] items-center justify-center text-sm">Подключение к звонку недоступно</main>
  ) : (
    <main className="h-[100dvh] w-full bg-black">
      <VideoMeetingStage
        className="relative flex h-full w-full items-center justify-center bg-black text-sm text-white"
        session={state.session}
      />
    </main>
  );
}
