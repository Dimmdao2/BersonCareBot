'use client';

import { useEffect, useState } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { VideoMeetingStage } from '@/shared/ui/video/VideoMeetingStage';

export function GuestLivePageClient() {
  const [session, setSession] = useState<VideoMeetingRenderSession | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    const bearer = window.location.hash.slice(1);
    if (!bearer) { setRefused(true); return; }
    void fetch('/api/video-meetings/guest/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearer }) })
      .then(async (response) => ({ response, data: await response.json() as { ok?: boolean; session?: VideoMeetingRenderSession } }))
      .then(({ response, data }) => {
        if (!response.ok || !data.ok || !data.session) { setRefused(true); return; }
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        setSession(data.session);
      })
      .catch(() => setRefused(true));
  }, []);
  return refused ? <main className="flex min-h-screen items-center justify-center text-sm">Подключение к звонку недоступно</main> : <main className="min-h-screen bg-black"><VideoMeetingStage session={session} /></main>;
}
