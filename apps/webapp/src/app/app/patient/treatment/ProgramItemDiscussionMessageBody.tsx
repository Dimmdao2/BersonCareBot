"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/patient/primitives/dialog";
import { PatientMediaPlaybackVideo } from "@/shared/ui/patient/media/PatientMediaPlaybackVideo";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { cn } from "@/lib/utils";
import { patientBodyTextClass } from "@/shared/ui/patient/patientVisual";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";

export function ProgramItemDiscussionMessageBody(props: {
  message: ProgramItemDiscussionMessage;
  mine: boolean;
}) {
  const { message, mine } = props;
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playback, setPlayback] = useState<MediaPlaybackPayload | null>(null);
  const mediaId = message.mediaFileId;

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    void fetch(`/api/media/${encodeURIComponent(mediaId)}/playback`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === "object" && "mediaId" in data) {
          setPlayback(data as MediaPlaybackPayload);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  if (mediaId) {
    const isVideo = playback?.delivery === "mp4" || playback?.delivery === "hls";
    const thumbMedia: import("@/modules/recommendations/types").RecommendationMediaItem =
      isVideo && playback?.posterUrl
        ? {
            mediaType: "video",
            mediaUrl: playback.posterUrl,
            previewSmUrl: playback.posterUrl,
            previewMdUrl: playback.posterUrl,
            sortOrder: 0,
          }
        : {
            mediaType: "image",
            mediaUrl: `/api/media/${encodeURIComponent(mediaId)}`,
            previewSmUrl: `/api/media/${encodeURIComponent(mediaId)}`,
            previewMdUrl: `/api/media/${encodeURIComponent(mediaId)}`,
            sortOrder: 0,
          };

    return (
      <>
        <button
          type="button"
          className="block max-w-full overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]"
          onClick={() => setPlayerOpen(true)}
        >
          <PatientCatalogMediaStaticThumb
            media={thumbMedia}
            frameClassName={cn(isVideo ? "aspect-video w-44" : "max-h-48 w-auto")}
            sizes="176px"
          />
        </button>
        <Dialog open={playerOpen} onOpenChange={setPlayerOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{isVideo ? "Видео" : "Фото"}</DialogTitle>
            </DialogHeader>
            {isVideo ?
              <PatientMediaPlaybackVideo
                mediaId={mediaId}
                mp4Url={`/api/media/${encodeURIComponent(mediaId)}`}
                title="Видео"
                initialPlayback={playback}
              />
            : /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/media/${encodeURIComponent(mediaId)}`}
                alt=""
                className="max-h-[70vh] w-full object-contain"
              />
            }
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!message.body?.trim()) return null;

  return (
    <p className={cn("whitespace-pre-wrap break-words", mine ? undefined : patientBodyTextClass)}>
      {message.body}
    </p>
  );
}
