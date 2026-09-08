'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/doctor/primitives/tabs';
import { VideoMeetingStage } from '@/shared/ui/video/VideoMeetingStage';
import { DoctorNotesPanel } from '@/app/app/doctor/clients/DoctorNotesPanel';
import { EncounterPageClient } from '../visits/EncounterPageClient';

type NotificationResult = {
  status: 'queued' | 'partially_queued' | 'skipped' | 'unavailable';
  selectedChannels: string[];
  queuedChannels: string[];
  deduplicatedChannels: string[];
};
type SessionResponse = {
  ok?: boolean;
  meetingId?: string;
  session?: VideoMeetingRenderSession;
  guestUrl?: string | null;
  resumed?: boolean;
  notification?: NotificationResult;
};

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
  const mountRequestedRef = useRef(false);
  const prepareInFlightRef = useRef<Promise<void> | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const [session, setSession] = useState<VideoMeetingRenderSession | null>(null);
  const [preparedMeetingId, setPreparedMeetingId] = useState<string | null>(null);
  const [guestUrl, setGuestUrl] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationResult | null>(null);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);

  const prepare = useCallback((mount: boolean) => {
    const request = async () => {
      const response = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await response.json() as SessionResponse;
      if (!response.ok || !data.ok || !data.session || !data.meetingId) throw new Error('prepare_failed');
      meetingIdRef.current = data.meetingId;
      setPreparedMeetingId(data.meetingId);
      setGuestUrl(data.guestUrl ?? null);
      setNotification(data.notification ?? null);
      if (mount) setSession(data.session);
    };
    const previous = prepareInFlightRef.current;
    const current = previous ? previous.catch(() => undefined).then(request) : request();
    prepareInFlightRef.current = current;
    void current.then(() => {
      if (prepareInFlightRef.current === current) prepareInFlightRef.current = null;
    }, () => {
      if (prepareInFlightRef.current === current) prepareInFlightRef.current = null;
    });
    return current;
  }, [appointmentId, userId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    queueMicrotask(() => { void prepare(false).catch(() => setError(true)); });
  }, [prepare]);

  const start = useCallback(() => {
    if (mountRequestedRef.current || session) return;
    mountRequestedRef.current = true;
    setStarting(true);
    setError(false);
    void prepare(true)
      .catch(() => {
        mountRequestedRef.current = false;
        setError(true);
      })
      .finally(() => setStarting(false));
  }, [prepare, session]);

  const retryPrepare = useCallback(() => {
    setError(false);
    void prepare(false).catch(() => setError(true));
  }, [prepare]);

  const end = useCallback(() => {
    const meetingId = meetingIdRef.current;
    if (!meetingId) return;
    meetingIdRef.current = null;
    setPreparedMeetingId(null);
    void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings/${encodeURIComponent(meetingId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end' }),
    });
  }, [userId]);

  const reportDiagnostic = useCallback((diagnostic: { event: 'join' | 'error' | 'end'; durationMs?: number; transport?: 'p2p' | 'relay'; errorClass?: 'connection' | 'media' | 'provider' }) => {
    const meetingId = meetingIdRef.current;
    if (!meetingId) return;
    void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings/${encodeURIComponent(meetingId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diagnostic }),
    });
  }, [userId]);

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
      <section className="relative flex min-h-0 min-w-0 overflow-hidden rounded-lg bg-black">
        <VideoMeetingStage className="relative flex min-h-0 flex-1 bg-black" session={session} onHangup={end} onDiagnostic={reportDiagnostic} />
        {!session ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button type="button" size="lg" disabled={starting} onClick={start}>Начать звонок</Button>
          </div>
        ) : null}
      </section>
      <aside className="min-w-0 overflow-hidden rounded-lg border bg-card p-3">
        {error ? <div className="mb-3 flex items-center gap-2 text-sm text-destructive"><span>Не удалось начать звонок</span><Button type="button" size="sm" variant="outline" onClick={retryPrepare}>Повторить</Button></div> : null}
        {notification ? <p className="mb-3 text-sm text-muted-foreground">{notification.status === 'queued' || notification.status === 'partially_queued' ? 'Приглашение поставлено в очередь' : 'Приглашение не отправлено автоматически'}</p> : null}
        <div className="mb-3 flex justify-end">
          {guestUrl ? <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(guestUrl)}><Copy className="size-4" /> Скопировать ссылку</Button> : null}
          {!guestUrl && preparedMeetingId ? <Button type="button" size="sm" variant="outline" onClick={() => {
            const meetingId = meetingIdRef.current;
            if (!meetingId) return;
            void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings/${encodeURIComponent(meetingId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate_invite' }) })
              .then(async (response) => ({ response, data: await response.json() as { ok?: boolean; guestUrl?: string | null; notification?: NotificationResult } }))
              .then(({ response, data }) => { if (response.ok && data.ok) { setGuestUrl(data.guestUrl ?? null); setNotification(data.notification ?? null); } else setError(true); })
              .catch(() => setError(true));
          }}>Выпустить новую ссылку</Button> : null}
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
