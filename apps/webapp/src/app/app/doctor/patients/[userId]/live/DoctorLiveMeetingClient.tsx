'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Copy, PanelRightClose, PanelRightOpen, Play } from 'lucide-react';
import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/doctor/primitives/tabs';
import { VideoMeetingStage } from '@/shared/ui/video/VideoMeetingStage';
import { useActiveCall } from '@/shared/ui/video/ActiveCallCoordinator';
import { DoctorNotesPanel } from '@/app/app/doctor/clients/DoctorNotesPanel';
import { EncounterPageClient } from '../visits/EncounterPageClient';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { notificationText } from '@/shared/notifications/notificationText';
import { DoctorShellDesktopRailRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { cn } from '@/lib/utils';

/** Сообщение о приглашении — подтверждение действия, а не постоянная надпись на экране. */
const INVITATION_NOTICE_MS = 12_000;

function invitationNoticeText(status: NotificationResult['status']): string {
  if (status === 'queued' || status === 'partially_queued') return notificationText.doctorVideoInviteSent;
  if (status === 'skipped') return notificationText.doctorVideoInviteAlreadySent;
  return notificationText.doctorVideoInviteNotSent;
}

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
  const { appointmentSingularLabel } = useDoctorPatientTerms();
  const pathname = usePathname();
  const router = useRouter();
  const activeCall = useActiveCall();
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), INVITATION_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 4_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const prepare = useCallback((mount: boolean) => {
    const request = async () => {
      const response = await fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await response.json() as SessionResponse;
      if (!response.ok || !data.ok || !data.session || !data.meetingId) throw new Error('prepare_failed');
      const meetingId = data.meetingId;
      meetingIdRef.current = meetingId;
      setPreparedMeetingId(meetingId);
      if (data.guestUrl) setGuestUrl(data.guestUrl);
      if (data.notification) setNotification(data.notification);
      if (mount) {
        const returnUrl = `${pathname}${appointmentId ? `?${new URLSearchParams({ appointmentId })}` : ''}`;
        const activated = activeCall.activate({
          session: data.session,
          returnUrl,
          onTerminal: () => {
            // The coordinator owns the live conference, while this local value only bridges the
            // activation render. Drop both when Jitsi ends so the desktop page cannot keep the
            // already-finished iframe mounted from its stale fallback session.
            setSession(null);
            mountRequestedRef.current = false;
            void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings/${encodeURIComponent(meetingId)}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end' }),
            });
          },
          onDiagnostic: (diagnostic) => {
            void fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/video-meetings/${encodeURIComponent(meetingId)}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diagnostic }),
            });
          },
        });
        if (!activated) throw new Error('active_call_exists');
        setSession(data.session);
      }
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
  }, [activeCall, appointmentId, pathname, userId]);

  useEffect(() => {
    if (activeCall.activeCall) return;
    if (startedRef.current) return;
    startedRef.current = true;
    queueMicrotask(() => { void prepare(false).catch(() => setError(true)); });
  }, [activeCall.activeCall, prepare]);

  const start = useCallback(() => {
    if (mountRequestedRef.current || session || activeCall.activeCall) return;
    mountRequestedRef.current = true;
    setStarting(true);
    setError(false);
    void prepare(true)
      .catch(() => {
        mountRequestedRef.current = false;
        setError(true);
      })
      .finally(() => setStarting(false));
  }, [activeCall.activeCall, prepare, session]);

  const retryPrepare = useCallback(() => {
    setError(false);
    void prepare(false).catch(() => setError(true));
  }, [prepare]);

  const activeSession = activeCall.activeCall?.session ?? session;
  const [notesOpen, setNotesOpen] = useState(true);

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/*
        Звонок — рабочая поверхность во весь экран, а не страница внутри кабинета. Поэтому левое
        меню сворачивается в полоску и на десктопе, а заметки убираются вбок по кнопке: владелец
        15.09.2026 — «меню на десктопе при этом сворачиваем в полоску как на планшете. заметки
        делаем сворачивающимся вбок тоже с кнопкой развернуть». Освободившуюся ширину забирает
        видео: собеседник крупнее, и собственная плитка (её размер — доля ширины) вместе с ним.
      */}
      <DoctorShellDesktopRailRegistration />
      {/*
        Сцена занимает всю свободную площадь. Навязывать ей пропорции не нужно: поток заполняет
        кадр средствами самого провайдера (`interfaceConfig.VIDEO_LAYOUT_FIT = 'height'`,
        deploy/jitsi/config/web/custom-interface_config.js), поэтому ни пустых полей, ни размытой
        подложки под ними не возникает.
      */}
      <section className="relative flex min-h-[320px] min-w-0 flex-1 overflow-hidden rounded-lg bg-black lg:min-h-0">
        {!activeCall.isMobile && (activeCall.isActiveRoute || !activeCall.activeCall) ? (
          <VideoMeetingStage
            className="relative flex min-h-0 flex-1 items-center justify-center bg-black text-sm text-white"
            session={activeSession}
            onHangup={activeCall.completeFromRenderer}
            onDiagnostic={activeCall.reportDiagnostic}
          />
        ) : null}
        {activeCall.activeCall && !activeCall.isActiveRoute ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button type="button" onClick={() => router.push(activeCall.activeCall!.returnUrl)}>
              Вернуться к звонку
            </Button>
          </div>
        ) : null}
        {!activeSession ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button type="button" size="lg" disabled={starting} onClick={start}><Play className="size-5" /> Начать звонок</Button>
          </div>
        ) : null}
      </section>
      <aside
        className={cn(
          'flex min-w-0 shrink-0 flex-col rounded-lg border bg-card lg:h-full lg:transition-[width] lg:duration-200',
          notesOpen ? 'lg:w-[420px]' : 'lg:w-12',
        )}
      >
        <div className="hidden shrink-0 justify-end p-1.5 lg:flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={notesOpen}
            aria-controls="doctor-live-notes"
            aria-label={notesOpen ? 'Свернуть заметки' : 'Развернуть заметки'}
            onClick={() => setNotesOpen((open) => !open)}
          >
            {notesOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </Button>
        </div>
        {/*
          Содержимое остаётся смонтированным и в свёрнутом виде: в заметке может лежать
          недописанный черновик, и размонтирование стёрло бы его вместе с панелью.
        */}
        <div
          id="doctor-live-notes"
          className={cn(
            'min-h-0 flex-1 overflow-y-auto p-3 lg:pt-0',
            !notesOpen && 'lg:hidden',
          )}
        >
        {error ? <div className="mb-3 flex items-center gap-2 text-sm text-destructive"><span>Не удалось начать звонок</span><Button type="button" size="sm" variant="outline" onClick={retryPrepare}>Повторить</Button></div> : null}
        {notification ? <p className="mb-3 text-sm text-muted-foreground">{invitationNoticeText(notification.status)}</p> : null}
        <div className="mb-3 flex justify-end">
          {guestUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(guestUrl).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              <Copy className="size-4" /> {copied ? notificationText.commonLinkCopied : 'Скопировать ссылку'}
            </Button>
          ) : null}
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
            {encountersEnabled ? <TabsTrigger value="encounter">{appointmentSingularLabel}</TabsTrigger> : null}
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
        </div>
      </aside>
    </main>
  );
}
