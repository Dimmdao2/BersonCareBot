import { runWebappPgText } from "@/infra/db/runWebappSql";

export async function insertPlaybackResolutionEvent(input: {
  userId: string;
  mediaId: string;
  delivery: "hls" | "mp4" | "file";
  fallbackUsed: boolean;
}): Promise<void> {
  await runWebappPgText(
    "SELECT app.record_media_playback_resolution_event($1::uuid, $2::uuid, $3, $4)",
    [input.userId, input.mediaId, input.delivery, input.fallbackUsed],
  );
}
