"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoContextMenuVideo } from "@/shared/ui/media/NoContextMenuVideo";
import { shouldUseNativeHls } from "@/shared/lib/nativeHls";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import { patientBodyTextClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  mediaId: string;
  mp4Url: string;
  title: string;
  /** From RSC when `video_playback_api_enabled` and session; otherwise null → progressive-only. */
  initialPlayback: MediaPlaybackPayload | null;
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

export function PatientContentAdaptiveVideo({ mediaId, mp4Url, title, initialPlayback }: Props) {
  if (!initialPlayback) {
    return <LegacyInlineVideo mp4Url={mp4Url} title={title} />;
  }

  return (
    <DualModePatientVideo
      mediaId={mediaId}
      mp4Url={mp4Url}
      title={title}
      initialPlayback={initialPlayback}
    />
  );
}

function LegacyInlineVideo({ mp4Url, title }: Pick<Props, "mp4Url" | "title">) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/30">
      {error ? (
        <div
          className={cn(
            patientBodyTextClass,
            "flex size-full flex-col items-center justify-center gap-3 p-4 text-center",
          )}
        >
          <p>{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Обновить страницу
          </Button>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
              <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : null}
          <NoContextMenuVideo
            controls
            preload="metadata"
            playsInline
            className="max-h-full w-full object-contain"
            title={title}
            onLoadedData={() => setLoading(false)}
            onError={() => {
              patientPlaybackDiag({ event: "video_error", mediaId: "legacy-mp4", delivery: "mp4" });
              setLoading(false);
              setError("Не удалось воспроизвести видео.");
            }}
          >
            <source src={mp4Url} />
          </NoContextMenuVideo>
        </>
      )}
    </div>
  );
}

function DualModePatientVideo({
  mediaId,
  mp4Url,
  title,
  initialPlayback,
}: {
  mediaId: string;
  mp4Url: string;
  title: string;
  initialPlayback: MediaPlaybackPayload;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const autoFallbackUsedRef = useRef(false);

  const [payload, setPayload] = useState<MediaPlaybackPayload>(initialPlayback);
  const [sourceKind, setSourceKind] = useState<"hls" | "mp4">(() =>
    initialPlayback.delivery === "hls" && initialPlayback.hls?.masterUrl ? "hls" : "mp4",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryBusy, setRetryBusy] = useState(false);

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
    const progressive = payload.mp4?.url ?? mp4Url;
    const posterUrl = payload.posterUrl;

    const tryMp4Fallback = () => {
      if (autoFallbackUsedRef.current || sourceKind !== "hls") return false;
      autoFallbackUsedRef.current = true;
      patientPlaybackDiag({ event: "auto_mp4_fallback", mediaId, delivery: "hls" });
      setSourceKind("mp4");
      return true;
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
        attachProgressive(video, progressive, posterUrl);
        return;
      }

      if (shouldUseNativeHls()) {
        attachNativeHls(video, masterUrl, posterUrl);
        return;
      }

      try {
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;

        if (!Hls.isSupported()) {
          attachProgressive(video, progressive, posterUrl);
          patientPlaybackDiag({ event: "hls_js_unsupported", mediaId });
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
          destroyHls();
          if (!tryMp4Fallback()) {
            finishError("Не удалось воспроизвести видео.");
          }
        });
      } catch (e) {
        if (cancelled) return;
        patientPlaybackDiag({ event: "hls_import_failed", mediaId, detail: String(e) });
        if (!tryMp4Fallback()) {
          finishError("Не удалось воспроизвести видео.");
        }
      }
    })();

    const onLoaded = () => finishLoadOk();
    const onVideoError = () => {
      if (cancelled) return;
      patientPlaybackDiag({ event: "video_error", mediaId, delivery: sourceKind });
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
  }, [destroyHls, mediaId, mp4Url, payload, sourceKind]);

  const onRetry = useCallback(async () => {
    setRetryBusy(true);
    setError(null);
    setLoading(true);
    autoFallbackUsedRef.current = false;
    try {
      const res = await fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`, {
        credentials: "include",
      });
      if (!res.ok) {
        patientPlaybackDiag({
          event: "playback_refetch_failed",
          mediaId,
          detail: String(res.status),
        });
        setError("Не удалось загрузить параметры воспроизведения.");
        setLoading(false);
        return;
      }
      const next = (await res.json()) as MediaPlaybackPayload;
      setPayload(next);
      setSourceKind(next.delivery === "hls" && next.hls?.masterUrl ? "hls" : "mp4");
    } catch {
      patientPlaybackDiag({ event: "playback_refetch_exception", mediaId });
      setError("Не удалось загрузить параметры воспроизведения.");
      setLoading(false);
    } finally {
      setRetryBusy(false);
    }
  }, [mediaId]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted/30">
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
            preload="metadata"
            playsInline
            className="max-h-full w-full object-contain"
            title={title}
          />
        </>
      )}
    </div>
  );
}
