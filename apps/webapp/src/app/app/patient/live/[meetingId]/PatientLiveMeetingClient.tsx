'use client';

import { useEffect, useState } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { VideoMeetingStage } from '@/shared/ui/video/VideoMeetingStage';

export function PatientLiveMeetingClient({ meetingId }: { meetingId: string }) {
  const [session, setSession] = useState<VideoMeetingRenderSession | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    void fetch(`/api/patient/video-meetings/${encodeURIComponent(meetingId)}/join`, { method: 'POST' })
      .then(async (response) => ({ response, data: await response.json() as { ok?: boolean; session?: VideoMeetingRenderSession } }))
      .then(({ response, data }) => response.ok && data.ok && data.session ? setSession(data.session) : setRefused(true))
      .catch(() => setRefused(true));
  }, [meetingId]);
  return refused ? <main className="flex min-h-screen items-center justify-center text-sm">Подключение к звонку недоступно</main> : <main className="min-h-screen bg-black"><VideoMeetingStage session={session} /></main>;
}
