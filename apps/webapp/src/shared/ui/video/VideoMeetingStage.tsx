'use client';

import type { VideoMeetingRenderSession } from '@/modules/video-meetings/ports';
import { JitsiMeetingRenderer } from './JitsiMeetingRenderer';

/** Provider-neutral meeting stage. Provider-specific browser code lives in render adapters. */
export function VideoMeetingStage({ session, onHangup, onDiagnostic, className }: {
  session: VideoMeetingRenderSession | null;
  onHangup?: () => void;
  onDiagnostic?: (diagnostic: { event: 'join' | 'error' | 'end'; durationMs?: number; transport?: 'p2p' | 'relay'; errorClass?: 'connection' | 'media' | 'provider' }) => void;
  className?: string;
}) {
  const stageClassName = className ?? 'flex min-h-[320px] items-center justify-center bg-muted text-sm text-muted-foreground';
  if (!session) return <div className={stageClassName}>Подключение…</div>;
  if (session.renderer === 'embedded_conference') return <JitsiMeetingRenderer session={session} onHangup={onHangup} onDiagnostic={onDiagnostic} className={className} />;
  return <div className={stageClassName}>Подключение к звонку недоступно</div>;
}
