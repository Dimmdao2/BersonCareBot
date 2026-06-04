"use client";

import { useEffect, useState } from "react";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import { DoctorMediaPlaybackVideo } from "@/shared/ui/doctor/media/DoctorMediaPlaybackVideo";

export function DoctorProgramActionLogMediaPreview(props: { mediaFileId: string }) {
  const { mediaFileId } = props;
  const [playback, setPlayback] = useState<MediaPlaybackPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/media/${encodeURIComponent(mediaFileId)}/playback`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "mediaId" in data) {
          setPlayback(data as MediaPlaybackPayload);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaFileId]);

  const isVideo = playback?.delivery === "mp4" || playback?.delivery === "hls";

  if (isVideo) {
    return (
      <div className="mt-1 max-w-xs">
        <DoctorMediaPlaybackVideo
          mediaId={mediaFileId}
          mp4Url={`/api/media/${encodeURIComponent(mediaFileId)}`}
          title="Видео пациента"
          initialPlayback={playback}
          shellClassName="relative aspect-video w-full max-w-xs overflow-hidden rounded-md bg-muted/30"
        />
      </div>
    );
  }

  if (failed) {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground">
        <a
          href={`/api/media/${encodeURIComponent(mediaFileId)}`}
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          Медиафайл
        </a>
      </p>
    );
  }

  return (
    <span className="mt-1 block max-w-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/media/${encodeURIComponent(mediaFileId)}`}
        alt=""
        className="max-h-32 max-w-full rounded-md object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
