'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/doctor/primitives/tabs';
import { VideoMeetingStage } from '@/shared/ui/video/VideoMeetingStage';
import { DoctorNotesPanel } from '@/app/app/doctor/clients/DoctorNotesPanel';
import { EncounterPageClient } from '../visits/EncounterPageClient';

type SessionResponse = { ok?: boolean; meetingId?: string; session?: VideoMeetingRenderSession; guestUrl?: string | null };

export function DoctorLiveMeetingClient({
  userId,
  appointmentId,
  patient,
  encountersEnabled,
  medicalRecordEnabled,
}: {
  userId: string;
  appointmentId: string | null;
  patient: {
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  encountersEnabled: boolean;
  medicalRecordEnabled: boolean;
}) {
  const startedRef = useRef(false);
  const meetingIdRef = useRef<string | null>(null);
  const [session, setSession] = useState<VideoMeetingRenderSession | null>(null);
  const [guestUrl, setGuestUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    }).then(async (response) => ({ response, data: await response.json() as SessionResponse }))
      .then(({ response, data }) => {
        if (!response.ok || !data.ok || !data.session || !data.meetingId) { setError(true); return; }
        meetingIdRef.current = data.meetingId;
        setSession(data.session);
        setGuestUrl(data.guestUrl ?? null);
      }).catch(() => setError(true));
  }, [appointmentId, userId]);

  const end = useCallback(() => {
    const meetingId = meetingIdRef.current;
    if (!meetingId) return;
    meetingIdRef.current = null;
    void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings/${encodeURIComponent(meetingId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end' }),
    });
  }, [userId]);

  return (
    <main className="grid min-h-[calc(100vh-4rem)] grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="min-w-0 overflow-hidden rounded-lg bg-black"><VideoMeetingStage session={session} onHangup={end} /></section>
      <aside className="min-w-0 overflow-hidden rounded-lg border bg-card p-3">
        {error ? <p className="text-sm text-destructive">Не удалось начать звонок</p> : null}
        <div className="mb-3 flex justify-end">
          <Button type="button" size="sm" variant="outline" disabled={!guestUrl} onClick={() => { if (guestUrl) void navigator.clipboard.writeText(guestUrl); }}>
            <Copy className="size-4" /> Скопировать ссылку
          </Button>
        </div>
        <Tabs defaultValue="note">
          <TabsList className={`grid w-full ${encountersEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <TabsTrigger value="note">Заметка</TabsTrigger>
            {encountersEnabled ? <TabsTrigger value="encounter">Приём</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="note" keepMounted className="mt-3 data-[state=inactive]:hidden">
            <DoctorNotesPanel userId={userId} embedded />
          </TabsContent>
          {encountersEnabled ? (
            <TabsContent value="encounter" keepMounted className="mt-3 data-[state=inactive]:hidden">
              <EncounterPageClient
                mode="create"
                userId={userId}
                patient={patient}
                boundAppointmentId={appointmentId}
                medicalRecordEnabled={medicalRecordEnabled}
                embedded
                onComplete={() => undefined}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </aside>
    </main>
  );
}
