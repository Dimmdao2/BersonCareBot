'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type YouTubePlayer = {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVolume(): number;
  isMuted(): boolean;
  mute(): void;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  unMute(): void;
};

type YouTubePlayerEvent = { target: YouTubePlayer };
type YouTubePlayerStateEvent = YouTubePlayerEvent & { data: number };

type YouTubeApi = {
  Player: new (
    iframe: HTMLIFrameElement,
    options: {
      events: {
        onReady(event: YouTubePlayerEvent): void;
        onStateChange(event: YouTubePlayerStateEvent): void;
        onError(): void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('youtube_iframe_api_missing'));
    };

    const existingScript = document.getElementById('youtube-iframe-api');
    if (existingScript) return;

    const script = document.createElement('script');
    script.id = 'youtube-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      youtubeApiPromise = null;
      reject(new Error('youtube_iframe_api_load_failed'));
    };
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

export type YouTubeIframePlayerController = {
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  failed: boolean;
  togglePlayback(): void;
  seekTo(seconds: number): void;
  setVolume(volume: number): void;
  toggleMuted(): void;
};

/**
 * Тонкая typed-обёртка над официальным YouTube IFrame Player API. Визуальные controls остаются
 * внутри patient/doctor зон, а загрузка API и команды плееру проходят через одну точку.
 */
export function useYouTubeIframePlayer(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  onFirstPlaying?: () => void,
): YouTubeIframePlayerController {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const onFirstPlayingRef = useRef(onFirstPlaying);
  const firstPlayingReportedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(100);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onFirstPlayingRef.current = onFirstPlaying;
  }, [onFirstPlaying]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cancelled = false;
    firstPlayingReportedRef.current = false;

    void loadYouTubeIframeApi()
      .then((api) => {
        if (cancelled) return;
        const player = new api.Player(iframe, {
          events: {
            onReady(event) {
              if (cancelled) return;
              playerRef.current = event.target;
              setReady(true);
              setDuration(event.target.getDuration());
              setVolumeState(event.target.getVolume());
              setMuted(event.target.isMuted());
            },
            onStateChange(event) {
              if (cancelled) return;
              const isPlaying = event.data === api.PlayerState.PLAYING;
              setPlaying(isPlaying);
              setCurrentTime(event.target.getCurrentTime());
              setDuration(event.target.getDuration());
              if (isPlaying && !firstPlayingReportedRef.current) {
                firstPlayingReportedRef.current = true;
                onFirstPlayingRef.current?.();
              }
              if (event.data === api.PlayerState.ENDED) setCurrentTime(event.target.getDuration());
            },
            onError() {
              if (!cancelled) setFailed(true);
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [iframeRef]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setCurrentTime(player.getCurrentTime());
      setDuration(player.getDuration());
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing]);

  const togglePlayback = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  }, [playing]);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(seconds, true);
    setCurrentTime(seconds);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(nextVolume);
    if (nextVolume > 0 && player.isMuted()) player.unMute();
    setVolumeState(nextVolume);
    setMuted(nextVolume === 0);
  }, []);

  const toggleMuted = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted()) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }, []);

  return {
    ready,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    failed,
    togglePlayback,
    seekTo,
    setVolume,
    toggleMuted,
  };
}
