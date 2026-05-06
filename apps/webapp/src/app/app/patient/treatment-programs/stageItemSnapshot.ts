import { DateTime } from "luxon";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import { listLfkSnapshotExerciseLines } from "@/modules/treatment-program/programActionActivityKey";
import { formatRelativePatientCalendarDayRu } from "@/modules/treatment-program/stage-semantics";

export type InstanceStageItem = TreatmentProgramInstanceDetail["stages"][number]["items"][number];

/** Разбор `snapshot.media` для превью и модалки: рекомендация (`mediaUrl`), упражнение ЛФК (`url` + `type`). */
export function parseSnapshotMediaForRowThumb(snapshot: Record<string, unknown>): RecommendationMediaItem[] {
  const raw = snapshot.media;
  if (!Array.isArray(raw)) return [];
  const items: RecommendationMediaItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const mediaUrl =
      typeof o.mediaUrl === "string"
        ? o.mediaUrl.trim()
        : typeof o.url === "string"
          ? o.url.trim()
          : "";
    if (!mediaUrl) continue;
    const mt = o.mediaType ?? o.type;
    const mediaType: RecommendationMediaItem["mediaType"] =
      mt === "video" || mt === "gif" || mt === "image" ? mt : "image";
    const sortOrder = typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? o.sortOrder : 0;
    const previewSmUrl =
      typeof o.previewSmUrl === "string" && o.previewSmUrl.trim() ? o.previewSmUrl.trim() : null;
    const previewMdUrl =
      typeof o.previewMdUrl === "string" && o.previewMdUrl.trim() ? o.previewMdUrl.trim() : null;
    const ps = o.previewStatus;
    const previewStatus =
      ps === "pending" || ps === "ready" || ps === "failed" || ps === "skipped" ? ps : null;
    items.push({
      mediaUrl,
      mediaType,
      sortOrder,
      ...(previewSmUrl ? { previewSmUrl } : {}),
      ...(previewMdUrl ? { previewMdUrl } : {}),
      ...(previewStatus ? { previewStatus } : {}),
    });
  }
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.mediaUrl.localeCompare(b.mediaUrl));
  return items;
}

/** Статичное превью в строке списка: сначала картинка/GIF, иначе первое медиа (видео). */
export function pickRecommendationRowPreviewMedia(items: RecommendationMediaItem[]): RecommendationMediaItem | null {
  if (items.length === 0) return null;
  const still = items.find((m) => m.mediaType === "image" || m.mediaType === "gif");
  return still ?? items[0] ?? null;
}

export function parseRecommendationMediaFromSnapshot(snapshot: Record<string, unknown>): RecommendationMediaItem[] {
  return parseSnapshotMediaForRowThumb(snapshot);
}

export function primaryMediaForStageItem(item: InstanceStageItem): RecommendationMediaItem | null {
  const snap = item.snapshot as Record<string, unknown>;
  if (item.itemType === "lfk_complex") {
    const lines = listLfkSnapshotExerciseLines(snap);
    for (const line of lines) {
      if (line.media != null && Array.isArray(line.media)) {
        const thumbItems = parseSnapshotMediaForRowThumb({ media: line.media } as Record<string, unknown>);
        const picked = pickRecommendationRowPreviewMedia(thumbItems);
        if (picked) return picked;
      }
    }
    return null;
  }
  const all = parseSnapshotMediaForRowThumb(snap);
  const video = all.find((m) => m.mediaType === "video");
  return video ?? all[0] ?? null;
}

/** Максимум по времени между последней отметкой в журнале и `completed_at` элемента (общая реализация для дашборда и экрана этапа). */
export function mergeLastActivityDisplayedIso(logIso: string | undefined, completedAt: string | null): string | null {
  const tLog = logIso?.trim() ? Date.parse(logIso) : NaN;
  const tDone = completedAt?.trim() ? Date.parse(completedAt) : NaN;
  if (!Number.isFinite(tLog) && !Number.isFinite(tDone)) return null;
  if (!Number.isFinite(tLog)) return completedAt!.trim();
  if (!Number.isFinite(tDone)) return logIso!.trim();
  return tLog >= tDone ? logIso!.trim() : completedAt!.trim();
}

function ruHourWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "часов";
  const mod10 = n % 10;
  if (mod10 === 1) return "час";
  if (mod10 >= 2 && mod10 <= 4) return "часа";
  return "часов";
}

/** Относительное время для строки активности на плитке этапа. */
export function formatRelativeTimeRu(iso: string, zone: string, now: DateTime = DateTime.now()): string {
  const t = DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
  if (!t.isValid) return formatRelativePatientCalendarDayRu(iso, zone, now);
  const diffMs = now.diff(t).as("milliseconds");
  if (diffMs < 0) return formatRelativePatientCalendarDayRu(iso, zone, now);
  if (diffMs < 60 * 60 * 1000) return "менее часа назад";
  if (diffMs < 24 * 60 * 60 * 1000) {
    const h = Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)));
    return `${h} ${ruHourWord(h)} назад`;
  }
  return formatRelativePatientCalendarDayRu(iso, zone, now);
}
