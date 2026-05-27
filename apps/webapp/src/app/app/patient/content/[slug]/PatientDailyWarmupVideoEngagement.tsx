"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PatientContentAdaptiveVideo,
  type PatientContentAdaptiveVideoProps,
} from "./PatientContentAdaptiveVideo";
import type { MediaPlaybackPayload } from "@/modules/media/playbackPayloadTypes";

type CatalogPlayerProps = Pick<
  PatientContentAdaptiveVideoProps,
  "mediaId" | "mp4Url" | "title" | "initialPlayback"
>;

type Props =
  | {
      mode: "catalog";
      contentPageId: string;
      player: CatalogPlayerProps;
    }
  | {
      mode: "hosted";
      contentPageId: string;
      iframeSrc: string;
      title: string;
    };

async function postDailyWarmupVideoViewed(contentPageId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/patient/daily-warmup/video-viewed", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentPageId }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function PatientDailyWarmupVideoEngagement(props: Props) {
  const router = useRouter();
  const reportedRef = useRef(false);

  const reportOnce = useCallback(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    void postDailyWarmupVideoViewed(props.contentPageId).then((ok) => {
      if (ok) router.refresh();
    });
  }, [props.contentPageId, router]);

  if (props.mode === "hosted") {
    return (
      <div className="relative aspect-video" onPointerDown={reportOnce}>
        <iframe
          src={props.iframeSrc}
          className="absolute inset-0 size-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={props.title}
        />
      </div>
    );
  }

  return (
    <PatientContentAdaptiveVideo
      {...props.player}
      onFirstPlaying={reportOnce}
    />
  );
}

export type { MediaPlaybackPayload };
