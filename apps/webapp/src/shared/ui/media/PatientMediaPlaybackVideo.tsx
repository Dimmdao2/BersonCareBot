/**
 * Единый пациентский видеоплеер: источник и fallback (HLS → MP4) задаёт только ответ
 * `GET /api/media/[id]/playback` и внутренняя логика при сбоях HLS — пользователь не выбирает формат доставки.
 * При HLS через hls.js и ≥2 вариантах в `hls.qualities` доступны режим «Авто» и фиксированное разрешение.
 *
 * Телеметрия / отладка: не логировать presigned URL, poster URL, query на подписанных ссылках.
 * Использовать только безопасные поля (mediaId, delivery, тип события, HTTP status) — см. `patientPlaybackDiag`.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { NoContextMenuVideo } from "@/shared/ui/media/NoContextMenuVideo";
import { shouldUseNativeHls } from "@/shared/lib/nativeHls";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import type { MediaAvailableQuality } from "@/modules/media/types";
import { patientBodyTextClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";
import { initialPlaybackSourceKind } from "@/shared/ui/media/patientPlaybackSourceKind";
import {
  PATIENT_HLS_QUALITY_AUTO_VALUE,
  displayLabelForSwitchedLevel,
  findQualityBySelectValue,
  matchQualityToLevelIndex,
  sortedQualitiesDesc,
  stableQualitySelectValue,
  type HlsVariantProbe,
} from "@/shared/ui/media/patientHlsQuality";

const DEFAULT_SHELL =
  "relative aspect-video w-full overflow-hidden rounded-lg bg-muted/30";

export type PatientMediaPlaybackVideoProps = {
  mediaId: string;
  /** Fallback progressive URL, если в JSON ещё нет `mp4.url` (обычно `/api/media/{id}`). */
  mp4Url: string;
  title: string;
  /**
   * JSON с сервера (RSC), если уже резолвнут; иначе `null` — компонент сам запросит `/playback`
   * (тот же контракт, без отдельного «простого» плеера по прямой ссылке).
   */
  initialPlayback: MediaPlaybackPayload | null;
  /** Оболочка (фон, скругление, shrink). */
  shellClassName?: string;
  /** Один раз при первом фактическом воспроизведении (событие `playing`). */
  onFirstPlaying?: () => void;
};

/** Dev-only diagnostics: never include presigned URLs. */
function patientPlaybackDiag(payload: { event: string; mediaId: string; delivery?: string; detail?: string }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[patient-playback]", payload);
}

function attachProgressive(video: HTMLVideoElement, url: string, posterUrl: string | null) {
  video.removeAttribute("src");
  while (video.firstChild) {
    video.removeChild(video.firstChild);
  }
  const src = document.createElement("source");
  src.src = url;
  video.appendChild(src);
  if (posterUrl) {
    video.poster = posterUrl;
  } else {
    video.removeAttribute("poster");
  }
  video.load();
}

function attachNativeHls(video: HTMLVideoElement, masterUrl: string, posterUrl: string | null) {
  while (video.firstChild) {
    video.removeChild(video.firstChild);
  }
  if (posterUrl) {
    video.poster = posterUrl;
  } else {
    video.removeAttribute("poster");
  }
  video.src = masterUrl;
  video.load();
}

function probeFromHlsJsLevel(level: {
  height: number;
  bitrate: number;
  maxBitrate: number;
  url: string[];
}): HlsVariantProbe {
  const url = level.url[0];
  return {
    height: level.height > 0 ? level.height : undefined,
    bitrate:
      level.bitrate > 0
        ? level.bitrate
        : level.maxBitrate > 0
          ? level.maxBitrate
          : undefined,
    url: url && url.length > 0 ? url : undefined,
  };
}

function PlaybackEngine({
  mediaId,
  mp4Url,
  title,
  initialPayload,
  shellClassName,
  onFirstPlaying,
}: {
  mediaId: string;
  mp4Url: string;
  title: string;
  initialPayload: MediaPlaybackPayload;
  shellClassName: string;
  onFirstPlaying?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const autoFallbackUsedRef = useRef(false);
  const hlsRefreshAttemptedRef = useRef(false);
  const lastIssueReportAtRef = useRef<Record<string, number>>({});
  const firstPlayingFiredRef = useRef(false);

  const [payload, setPayload] = useState<MediaPlaybackPayload>(initialPayload);
  const [sourceKind, setSourceKind] = useState<"hls" | "mp4">(() =>
    initialPlaybackSourceKind(initialPayload),
  );
  const sortedPlaybackQualities = useMemo(
    () => sortedQualitiesDesc(payload.hls?.qualities ?? []),
    [payload.hls?.qualities],
  );

  const [hlsQualityChoice, setHlsQualityChoice] = useState<string>(PATIENT_HLS_QUALITY_AUTO_VALUE);
  const [hlsCurrentLabel, setHlsCurrentLabel] = useState<string | null>(null);
  const hlsQualityChoiceRef = useRef(hlsQualityChoice);
  hlsQualityChoiceRef.current = hlsQualityChoice;

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryBusy, setRetryBusy] = useState(false);

  useEffect(() => {
    setHlsQualityChoice(PATIENT_HLS_QUALITY_AUTO_VALUE);
    setHlsCurrentLabel(null);
  }, [mediaId, payload.hls?.masterUrl]);

  const applyPatientHlsQualityChoice = useCallback((hls: Hls, choice: string, qs: MediaAvailableQuality[]) => {
    if (choice === PATIENT_HLS_QUALITY_AUTO_VALUE) {
      hls.loadLevel = -1;
      return;
    }
    const row = findQualityBySelectValue(qs, choice);
    if (!row) return;
    const probes = hls.levels.map((lvl) => probeFromHlsJsLevel(lvl));
    const idx = matchQualityToLevelIndex(probes, row);
    if (idx == null || idx < 0) return;
    hls.currentLevel = idx;
  }, []);

  const onHlsQualityValueChange = useCallback(
    (value: string | null) => {
      if (value == null) return;
      setHlsQualityChoice(value);
      const hls = hlsRef.current;
      if (!hls) return;
      applyPatientHlsQualityChoice(hls, value, sortedPlaybackQualities);
    },
    [applyPatientHlsQualityChoice, sortedPlaybackQualities],
  );

  const qualityTriggerDisplayLabel = useMemo(() => {
    if (hlsQualityChoice === PATIENT_HLS_QUALITY_AUTO_VALUE) return "Авто";
    const q = findQualityBySelectValue(sortedPlaybackQualities, hlsQualityChoice);
    if (!q) return "Качество";
    if (q.label?.trim()) return q.label.trim();
    if (typeof q.height === "number") return `${q.height}p`;
    return "Качество";
  }, [hlsQualityChoice, sortedPlaybackQualities]);

  const useNativeHlsPlayback = shouldUseNativeHls();
  const showNativeQualityHint = sourceKind === "hls" && useNativeHlsPlayback && !error;
  const showHlsJsQualityControls =
    sourceKind === "hls" && !useNativeHlsPlayback && sortedPlaybackQualities.length >= 2 && !error;

  const fetchPlaybackJson = useCallback(async (): Promise<MediaPlaybackPayload | null> => {
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return (await res.json()) as MediaPlaybackPayload;
    } catch {
      return null;
    }
  }, [mediaId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onFirstPlaying) return;
    const onPlaying = () => {
      if (firstPlayingFiredRef.current) return;
      firstPlayingFiredRef.current = true;
      onFirstPlaying();
    };
    video.addEventListener("playing", onPlaying);
    return () => video.removeEventListener("playing", onPlaying);
  }, [onFirstPlaying]);

  const reportPlaybackIssue = useCallback(
    (input: { eventClass: string; delivery?: "hls" | "mp4" | "file"; errorDetail?: string }) => {
      const key = `${input.eventClass}:${input.delivery ?? "na"}`;
      const now = Date.now();
      const prev = lastIssueReportAtRef.current[key] ?? 0;
      // Protect backend from burst loops while still keeping diagnostic signal.
      if (now - prev < 15_000) return;
      lastIssueReportAtRef.current[key] = now;

      void fetch(`/api/media/${encodeURIComponent(mediaId)}/playback/events`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventClass: input.eventClass,
          delivery: input.delivery,
          errorDetail: input.errorDetail,
        }),
        keepalive: true,
      }).catch(() => {
        // Diagnostics are best-effort and must never affect playback UX.
      });
    },
    [mediaId],
  );

  useEffect(() => {
    if (sourceKind !== "hls" || !payload.hls?.masterUrl) return;
    const sec = Math.max(60, payload.expiresInSeconds ?? 3600);
    const leadSec = Math.min(300, Math.max(60, Math.floor(sec / 10)));
    const delayMs = Math.max(30_000, (sec - leadSec) * 1000);
    const timerId = window.setTimeout(() => {
      void (async () => {
        const next = await fetchPlaybackJson();
        if (!next) return;
        setPayload(next);
        if (initialPlaybackSourceKind(next) === "hls") {
          setSourceKind("hls");
        }
      })();
    }, delayMs);
    return () => window.clearTimeout(timerId);
  }, [fetchPlaybackJson, sourceKind, payload.expiresInSeconds, payload.hls?.masterUrl]);

  const destroyHls = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setLoading(true);
    destroyHls();

    const masterUrl = payload.hls?.masterUrl;
    const progressiveUrl = payload.mp4?.url ?? mp4Url;
    const posterUrl = payload.posterUrl;

    const tryMp4Fallback = () => {
      if (autoFallbackUsedRef.current || sourceKind !== "hls") return false;
      autoFallbackUsedRef.current = true;
      patientPlaybackDiag({ event: "auto_mp4_fallback", mediaId, delivery: "hls" });
      setSourceKind("mp4");
      return true;
    };

    const tryRefreshHlsOnceThenFallback = async () => {
      // One HLS refresh is enough for expired presigned URLs; repeated fatal loops should stop at MP4.
      if (hlsRefreshAttemptedRef.current) {
        if (!tryMp4Fallback()) {
          reportPlaybackIssue({ eventClass: "hls_fatal", delivery: "hls", errorDetail: "refresh_exhausted" });
          finishError("Не удалось воспроизвести видео.");
        }
        return;
      }

      hlsRefreshAttemptedRef.current = true;
      const next = await fetchPlaybackJson();
      if (next && next.hls?.masterUrl && initialPlaybackSourceKind(next) === "hls") {
        setPayload(next);
        setSourceKind("hls");
        return;
      }
      if (!tryMp4Fallback()) {
        reportPlaybackIssue({ eventClass: "hls_fatal", delivery: "hls", errorDetail: "refresh_no_hls_payload" });
        finishError("Не удалось воспроизвести видео.");
      }
    };

    const finishLoadOk = () => {
      if (!cancelled) setLoading(false);
    };

    const finishError = (msg: string) => {
      if (!cancelled) {
        setLoading(false);
        setError(msg);
      }
    };

    void (async () => {
      if (sourceKind === "mp4" || !masterUrl) {
        attachProgressive(video, progressiveUrl, posterUrl);
        return;
      }

      if (useNativeHlsPlayback) {
        attachNativeHls(video, masterUrl, posterUrl);
        return;
      }

      try {
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;

        if (!Hls.isSupported()) {
          if (!cancelled) setSourceKind("mp4");
          attachProgressive(video, progressiveUrl, posterUrl);
          patientPlaybackDiag({ event: "hls_js_unsupported", mediaId });
          reportPlaybackIssue({ eventClass: "hls_js_unsupported", delivery: "hls" });
          return;
        }

        if (posterUrl) {
          video.poster = posterUrl;
        } else {
          video.removeAttribute("poster");
        }
        while (video.firstChild) video.removeChild(video.firstChild);

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hlsRef.current = hls;
        const qs = sortedPlaybackQualities;

        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          if (cancelled) return;
          const probes = hls.levels.map((lvl) => probeFromHlsJsLevel(lvl));
          setHlsCurrentLabel(displayLabelForSwitchedLevel(probes, data.level, qs));
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          applyPatientHlsQualityChoice(hls, hlsQualityChoiceRef.current, qs);
          const cur = hls.currentLevel;
          if (cur >= 0 && hls.levels.length > 0) {
            const probes = hls.levels.map((lvl) => probeFromHlsJsLevel(lvl));
            setHlsCurrentLabel(displayLabelForSwitchedLevel(probes, cur, qs));
          }
        });

        hls.loadSource(masterUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (cancelled || !data.fatal) return;
          patientPlaybackDiag({
            event: "hls_fatal",
            mediaId,
            delivery: "hls",
            detail: data.type,
          });
          reportPlaybackIssue({ eventClass: "hls_fatal", delivery: "hls", errorDetail: data.type });
          destroyHls();
          void tryRefreshHlsOnceThenFallback();
        });
      } catch (e) {
        if (cancelled) return;
        patientPlaybackDiag({ event: "hls_import_failed", mediaId, detail: String(e) });
        reportPlaybackIssue({ eventClass: "hls_import_failed", delivery: "hls", errorDetail: String(e) });
        if (!tryMp4Fallback()) {
          finishError("Не удалось воспроизвести видео.");
        }
      }
    })();

    const onLoaded = () => {
      if (sourceKind === "hls") {
        hlsRefreshAttemptedRef.current = false;
      }
      finishLoadOk();
    };
    const onVideoError = () => {
      if (cancelled) return;
      patientPlaybackDiag({ event: "video_error", mediaId, delivery: sourceKind });
      reportPlaybackIssue({ eventClass: "video_error", delivery: sourceKind });
      if (sourceKind === "hls") {
        void tryRefreshHlsOnceThenFallback();
        return;
      }
      if (!tryMp4Fallback()) {
        finishError("Не удалось воспроизвести видео.");
      }
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onVideoError);

    return () => {
      cancelled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onVideoError);
      destroyHls();
      video.pause();
      video.removeAttribute("src");
      while (video.firstChild) video.removeChild(video.firstChild);
      video.load();
    };
  }, [
    applyPatientHlsQualityChoice,
    destroyHls,
    fetchPlaybackJson,
    mediaId,
    mp4Url,
    payload.hls?.masterUrl,
    payload.mp4?.url,
    payload.posterUrl,
    reportPlaybackIssue,
    sortedPlaybackQualities,
    sourceKind,
    useNativeHlsPlayback,
  ]);

  const onRetry = useCallback(async () => {
    setRetryBusy(true);
    setError(null);
    setLoading(true);
    autoFallbackUsedRef.current = false;
    hlsRefreshAttemptedRef.current = false;
    try {
      const next = await fetchPlaybackJson();
      if (!next) {
        patientPlaybackDiag({
          event: "playback_refetch_failed",
          mediaId,
          detail: "no_body",
        });
        reportPlaybackIssue({
          eventClass: "playback_refetch_failed",
          delivery: sourceKind,
          errorDetail: "no_body",
        });
        setError("Не удалось загрузить параметры воспроизведения.");
        setLoading(false);
        return;
      }
      setPayload(next);
      setSourceKind(initialPlaybackSourceKind(next));
    } catch {
      patientPlaybackDiag({ event: "playback_refetch_exception", mediaId });
      reportPlaybackIssue({ eventClass: "playback_refetch_exception", delivery: sourceKind });
      setError("Не удалось загрузить параметры воспроизведения.");
      setLoading(false);
    } finally {
      setRetryBusy(false);
    }
  }, [fetchPlaybackJson, mediaId, reportPlaybackIssue, sourceKind]);

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className={shellClassName}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        {error ? (
          <div
            className={cn(
              patientBodyTextClass,
              "flex size-full flex-col items-center justify-center gap-3 p-4 text-center",
            )}
          >
            <p>{error}</p>
            <Button type="button" variant="secondary" size="sm" disabled={retryBusy} onClick={() => void onRetry()}>
              {retryBusy ? "Загрузка…" : "Повторить"}
            </Button>
            <p className={cn(patientMutedTextClass, "text-xs")}>
              Если ошибка повторяется, обновите страницу или проверьте, что вы вошли в аккаунт.
            </p>
          </div>
        ) : (
          <>
            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : null}
            <NoContextMenuVideo
              ref={videoRef}
              controls
              controlsList="nodownload"
              preload="metadata"
              playsInline
              className="absolute inset-0 z-0 h-full w-full object-contain"
              title={title}
            />
          </>
        )}
      </div>
      {!error && showNativeQualityHint ? (
        <p className={cn(patientMutedTextClass, "text-right text-xs")}>Качество: авто</p>
      ) : null}
      {!error && showHlsJsQualityControls ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={cn(patientMutedTextClass, "text-xs tabular-nums")} aria-live="polite">
            Сейчас: {hlsCurrentLabel ?? "—"}
          </span>
          <Select value={hlsQualityChoice} onValueChange={onHlsQualityValueChange}>
            <SelectTrigger
              size="sm"
              displayLabel={qualityTriggerDisplayLabel}
              aria-label="Разрешение видео"
              className="max-w-full"
            />
            <SelectContent align="end" className="min-w-36">
              <SelectItem value={PATIENT_HLS_QUALITY_AUTO_VALUE}>Авто</SelectItem>
              {sortedPlaybackQualities.map((q) => {
                const v = stableQualitySelectValue(q);
                const itemLabel = q.label?.trim() || (typeof q.height === "number" ? `${q.height}p` : v);
                return (
                  <SelectItem key={v} value={v}>
                    {itemLabel}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

export function PatientMediaPlaybackVideo({
  mediaId,
  mp4Url,
  title,
  initialPlayback,
  shellClassName,
  onFirstPlaying,
}: PatientMediaPlaybackVideoProps) {
  const shell = cn(DEFAULT_SHELL, shellClassName);
  const [payload, setPayload] = useState<MediaPlaybackPayload | null>(() => initialPlayback);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">(() =>
    initialPlayback ? "ready" : "loading",
  );
  const [bootRetryBusy, setBootRetryBusy] = useState(false);

  const fetchPlaybackJson = useCallback(async (): Promise<MediaPlaybackPayload | null> => {
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return (await res.json()) as MediaPlaybackPayload;
    } catch {
      return null;
    }
  }, [mediaId]);

  useEffect(() => {
    if (initialPlayback) {
      // Defer setState out of the effect body (react-hooks/set-state-in-effect).
      // Lazy `useState` init already matches on first paint when SSR passes JSON.
      const t = window.setTimeout(() => {
        setPayload(initialPlayback);
        setPhase("ready");
      }, 0);
      return () => window.clearTimeout(t);
    }
    let cancelled = false;
    void (async () => {
      setPhase("loading");
      const p = await fetchPlaybackJson();
      if (cancelled) return;
      if (p) {
        setPayload(p);
        setPhase("ready");
      } else {
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPlayback, fetchPlaybackJson]);

  const onBootstrapRetry = useCallback(async () => {
    setBootRetryBusy(true);
    setPhase("loading");
    const p = await fetchPlaybackJson();
    if (p) {
      setPayload(p);
      setPhase("ready");
    } else {
      setPhase("error");
    }
    setBootRetryBusy(false);
  }, [fetchPlaybackJson]);

  if (phase === "loading") {
    return (
      <div
        className={shell}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </div>
    );
  }

  if (phase === "error" || !payload) {
    return (
      <div
        className={shell}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        <div
          className={cn(
            patientBodyTextClass,
            "flex size-full flex-col items-center justify-center gap-3 p-4 text-center",
          )}
        >
          <p>Не удалось загрузить параметры воспроизведения.</p>
          <Button type="button" variant="secondary" size="sm" disabled={bootRetryBusy} onClick={() => void onBootstrapRetry()}>
            {bootRetryBusy ? "Загрузка…" : "Повторить"}
          </Button>
          <p className={cn(patientMutedTextClass, "text-xs")}>
            Если вы не вошли в аккаунт, видео будет недоступно.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PlaybackEngine
      key={mediaId}
      mediaId={mediaId}
      mp4Url={mp4Url}
      title={title}
      initialPayload={payload}
      shellClassName={shell}
      onFirstPlaying={onFirstPlaying}
    />
  );
}
