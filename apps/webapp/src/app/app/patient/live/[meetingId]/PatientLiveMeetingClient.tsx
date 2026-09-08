'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/patient/primitives/tabs';
import { VideoMeetingStage } from '@/shared/ui/video/VideoMeetingStage';
import { patientBodyTextClass } from '@/shared/ui/patient/patientVisual';

export function PatientLiveMeetingClient({
  meetingId,
  diaryPanel,
  programPanel,
}: {
  meetingId: string;
  diaryPanel?: ReactNode;
  programPanel?: ReactNode;
}) {
  const [session, setSession] = useState<VideoMeetingRenderSession | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    void fetch(`/api/patient/video-meetings/${encodeURIComponent(meetingId)}/join`, { method: 'POST' })
      .then(async (response) => ({ response, data: await response.json() as { ok?: boolean; session?: VideoMeetingRenderSession } }))
      .then(({ response, data }) => response.ok && data.ok && data.session ? setSession(data.session) : setRefused(true))
      .catch(() => setRefused(true));
  }, [meetingId]);
  if (refused) {
    return (
      <main className={`flex min-h-screen items-center justify-center ${patientBodyTextClass}`}>
        Подключение к звонку недоступно
      </main>
    );
  }
  const hasPatientPanels = diaryPanel != null || programPanel != null;
  return (
    <main className={hasPatientPanels ? 'grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]' : 'min-h-screen bg-black'}>
      <section className="min-w-0 bg-black">
        <VideoMeetingStage session={session} />
      </section>
      {session && hasPatientPanels ? (
        <aside className="min-w-0 overflow-hidden border bg-[var(--patient-bg)] p-3">
          <Tabs defaultValue={diaryPanel ? 'diary' : 'program'}>
            <TabsList className={`grid w-full ${diaryPanel && programPanel ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {diaryPanel ? <TabsTrigger value="diary">Дневник</TabsTrigger> : null}
              {programPanel ? <TabsTrigger value="program">Программа</TabsTrigger> : null}
            </TabsList>
            {diaryPanel ? <TabsContent value="diary" className="mt-3">{diaryPanel}</TabsContent> : null}
            {programPanel ? <TabsContent value="program" className="mt-3">{programPanel}</TabsContent> : null}
          </Tabs>
        </aside>
      ) : null}
    </main>
  );
}
