'use client';

import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { JitsiMeetingRenderer } from './JitsiMeetingRenderer';

/** Provider-neutral meeting stage. Provider-specific browser code lives in render adapters. */
export function VideoMeetingStage({ session, onHangup, onDiagnostic }: {
  session: VideoMeetingRenderSession | null;
  onHangup?: () => void;
  onDiagnostic?: (diagnostic: { event: 'join' | 'error' | 'end'; durationMs?: number; transport?: 'p2p' | 'relay'; errorClass?: 'connection' | 'media' | 'provider' }) => void;
}) {
  if (!session) return <div className="flex min-h-[320px] items-center justify-center bg-muted text-sm text-muted-foreground">Подключение…</div>;
  if (session.renderer === 'embedded_conference') return <JitsiMeetingRenderer session={session} onHangup={onHangup} onDiagnostic={onDiagnostic} />;
  return <div className="flex min-h-[320px] items-center justify-center bg-muted text-sm text-muted-foreground">Подключение к звонку недоступно</div>;
}
