'use client';

import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useRef, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import {
  isHostedVideoEmbedSrc,
  parseHostedVideoLink,
  toYouTubeCustomControlsEmbedSrc,
  type HostedVideoPlayerKind,
} from '@/shared/lib/hostingEmbedUrls';
import { useRutubeIframePlayer } from '@/shared/lib/useRutubeIframePlayer';
import { useYouTubeIframePlayer } from '@/shared/lib/useYouTubeIframePlayer';
import { Button } from '@/shared/ui/doctor/primitives/button';

export type HostedVideoEmbedProps = {
  /** Канонический URL ролика; источник и стратегия плеера определяются заново из этой строки. */
  url: string;
  title: string;
  className?: string;
  onFirstPlaying?: () => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

type CustomPlayerController = ReturnType<
  typeof useYouTubeIframePlayer | typeof useRutubeIframePlayer
>;

function CustomPlayerChrome({
  src,
  title,
  className,
  iframeRef,
  player,
  playerKind,
  nativeFallbackSrc,
}: {
  src: string;
  title: string;
  className?: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  player: CustomPlayerController;
  playerKind: Exclude<HostedVideoPlayerKind, 'provider_native_controls'>;
  nativeFallbackSrc: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);

  if (player.failed) {
    return (
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden rounded-lg bg-black',
          className,
        )}
      >
        <iframe
          src={nativeFallbackSrc}
          className="absolute inset-0 size-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={cn('flex w-full flex-col overflow-hidden rounded-lg bg-black', className)}
      data-player-kind={playerKind}
    >
      <div className="relative aspect-video min-h-0 w-full flex-1 bg-black">
        <iframe
          ref={iframeRef}
          src={src}
          className="absolute inset-0 size-full border-0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title}
          loading="lazy"
        />
      </div>
      <div className="flex h-11 shrink-0 items-center gap-1.5 bg-black px-2 text-white">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-none text-white hover:bg-white/15 hover:text-white"
          disabled={!player.ready}
          onClick={player.togglePlayback}
          aria-label={player.playing ? 'Пауза' : 'Воспроизвести'}
        >
          {player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <span className="min-w-10 text-center text-xs tabular-nums">
          {formatTime(player.currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(player.duration, 1)}
          step={0.1}
          value={Math.min(player.currentTime, Math.max(player.duration, 1))}
          disabled={!player.ready || player.duration <= 0}
          onChange={(event) => player.seekTo(Number(event.currentTarget.value))}
          className="min-w-0 flex-1 accent-white"
          aria-label="Позиция видео"
        />
        <span className="hidden min-w-10 text-center text-xs tabular-nums sm:inline">
          {formatTime(player.duration)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-none text-white hover:bg-white/15 hover:text-white"
          disabled={!player.ready}
          onClick={player.toggleMuted}
          aria-label={player.muted ? 'Включить звук' : 'Выключить звук'}
        >
          {player.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={player.muted ? 0 : player.volume}
          disabled={!player.ready}
          onChange={(event) => player.setVolume(Number(event.currentTarget.value))}
          className="hidden w-20 accent-white md:block"
          aria-label="Громкость"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-none text-white hover:bg-white/15 hover:text-white"
          onClick={() => void shellRef.current?.requestFullscreen()}
          aria-label="Во весь экран"
        >
          <Maximize className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function YouTubeCustomPlayer({
  src,
  videoRef,
  title,
  className,
  onFirstPlaying,
}: {
  src: string;
  videoRef: string;
  title: string;
  className?: string;
  onFirstPlaying?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const player = useYouTubeIframePlayer(iframeRef, onFirstPlaying);
  return (
    <CustomPlayerChrome
      src={src}
      title={title}
      className={className}
      iframeRef={iframeRef}
      player={player}
      playerKind="youtube_custom_controls"
      nativeFallbackSrc={`https://www.youtube-nocookie.com/embed/${videoRef}`}
    />
  );
}

function RutubeCustomPlayer({
  src,
  title,
  className,
  onFirstPlaying,
}: {
  src: string;
  title: string;
  className?: string;
  onFirstPlaying?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const player = useRutubeIframePlayer(iframeRef, onFirstPlaying);
  return (
    <CustomPlayerChrome
      src={src}
      title={title}
      className={className}
      iframeRef={iframeRef}
      player={player}
      playerKind="rutube_custom_controls"
      nativeFallbackSrc={src}
    />
  );
}

/** Один вход внешнего видео: YouTube/RUTUBE получают наши controls, VK/Vimeo — штатный iframe. */
export function HostedVideoEmbed({ url, title, className, onFirstPlaying }: HostedVideoEmbedProps) {
  const link = parseHostedVideoLink(url);
  if (!link || !isHostedVideoEmbedSrc(link.embedSrc)) {
    return (
      <div
        className={cn(
          'flex aspect-video w-full items-center justify-center bg-muted/30 px-3 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        Ссылка на видео не распознана — откройте упражнение и вставьте её заново.
      </div>
    );
  }

  if (link.playerKind === 'youtube_custom_controls') {
    const src = toYouTubeCustomControlsEmbedSrc(link);
    if (src && isHostedVideoEmbedSrc(src)) {
      return (
        <YouTubeCustomPlayer
          key={link.videoRef}
          src={src}
          videoRef={link.videoRef}
          title={title}
          className={className}
          onFirstPlaying={onFirstPlaying}
        />
      );
    }
  }

  if (link.playerKind === 'rutube_custom_controls') {
    return (
      <RutubeCustomPlayer
        key={link.videoRef}
        src={link.embedSrc}
        title={title}
        className={className}
        onFirstPlaying={onFirstPlaying}
      />
    );
  }

  return (
    <div
      className={cn('relative aspect-video w-full overflow-hidden rounded-lg bg-black', className)}
      data-player-kind="provider_native_controls"
      onPointerDown={onFirstPlaying}
    >
      <iframe
        src={link.embedSrc}
        className="absolute inset-0 size-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={title}
        loading="lazy"
      />
    </div>
  );
}
