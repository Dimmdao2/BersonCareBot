'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const RUTUBE_ORIGIN = 'https://rutube.ru';

type RutubeMessage = {
  type: string;
  data?: unknown;
};

type RutubeRecord = Record<string, unknown>;

function asRecord(value: unknown): RutubeRecord | null {
  return typeof value === 'object' && value !== null ? (value as RutubeRecord) : null;
}

function parseRutubeMessage(value: unknown): RutubeMessage | null {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  const record = asRecord(parsed);
  return record && typeof record.type === 'string'
    ? { type: record.type, data: record.data }
    : null;
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export type RutubeIframePlayerController = {
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

/** Typed-адаптер официального RUTUBE postMessage API. */
export function useRutubeIframePlayer(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  onFirstPlaying?: () => void,
): RutubeIframePlayerController {
  const onFirstPlayingRef = useRef(onFirstPlaying);
  const firstPlayingReportedRef = useRef(false);
  const adPlayingRef = useRef(false);
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

  const send = useCallback(
    (type: string, data?: RutubeRecord) => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      const message = data === undefined ? { type } : { type, data };
      target.postMessage(JSON.stringify(message), RUTUBE_ORIGIN);
    },
    [iframeRef],
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (event.origin !== RUTUBE_ORIGIN || !iframeWindow || event.source !== iframeWindow) return;

      const message = parseRutubeMessage(event.data);
      if (!message) return;
      const data = asRecord(message.data);

      switch (message.type) {
        case 'player:ready':
          setReady(true);
          send('player:hideControls');
          break;
        case 'player:changeState': {
          const state = data?.state;
          if (state === 'playing' && !adPlayingRef.current) {
            setPlaying(true);
            if (!firstPlayingReportedRef.current) {
              firstPlayingReportedRef.current = true;
              onFirstPlayingRef.current?.();
            }
          } else if (state === 'paused' || state === 'stopped') {
            setPlaying(false);
          }
          break;
        }
        case 'player:durationChange': {
          const nextDuration = finiteNumber(data?.duration);
          if (nextDuration !== null && nextDuration >= 0) setDuration(nextDuration);
          break;
        }
        case 'player:currentTime': {
          if (adPlayingRef.current) break;
          const nextTime = finiteNumber(data?.time);
          if (nextTime !== null && nextTime >= 0) setCurrentTime(nextTime);
          break;
        }
        case 'player:volumeChange': {
          const nextVolume = finiteNumber(data?.volume);
          if (nextVolume !== null)
            setVolumeState(Math.round(Math.min(1, Math.max(0, nextVolume)) * 100));
          if (typeof data?.muted === 'boolean') setMuted(data.muted);
          break;
        }
        case 'player:adStart':
          adPlayingRef.current = true;
          break;
        case 'player:adEnd':
          adPlayingRef.current = false;
          break;
        case 'player:rollState':
          if (data?.state === 'play') adPlayingRef.current = true;
          if (data?.state === 'complete') adPlayingRef.current = false;
          break;
        case 'player:playComplete':
          setPlaying(false);
          setCurrentTime(duration);
          break;
        case 'player:error':
          setFailed(true);
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [duration, iframeRef, send]);

  const togglePlayback = useCallback(() => {
    send(playing ? 'player:pause' : 'player:play', {});
  }, [playing, send]);

  const seekTo = useCallback(
    (seconds: number) => {
      send('player:setCurrentTime', { time: seconds });
      setCurrentTime(seconds);
    },
    [send],
  );

  const setVolume = useCallback(
    (nextVolume: number) => {
      const normalized = Math.min(100, Math.max(0, nextVolume));
      send('player:setVolume', { volume: normalized / 100 });
      if (normalized > 0 && muted) send('player:unMute');
      setVolumeState(normalized);
      setMuted(normalized === 0);
    },
    [muted, send],
  );

  const toggleMuted = useCallback(() => {
    send(muted ? 'player:unMute' : 'player:mute');
    setMuted((current) => !current);
  }, [muted, send]);

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
