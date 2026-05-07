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

/** Plain-текст из `bodyMd` снимка рекомендации для превью в списке (без рендера MD). */
export function recommendationBodyMdPreviewPlain(bodyMd: unknown): string {
  if (typeof bodyMd !== "string" || !bodyMd.trim()) return "";
  let s = bodyMd.trim();
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1 ");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
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

/** Сутки с 03:00 до 03:00 следующего календарного дня (в переданной зоне, напр. локаль клиента). */
function startOfLogicalDayAtThree(dt: DateTime): DateTime {
  const d = dt.startOf("day");
  const at03 = d.set({ hour: 3, minute: 0, second: 0, millisecond: 0 });
  if (dt < at03) {
    return d.minus({ days: 1 }).set({ hour: 3, minute: 0, second: 0, millisecond: 0 });
  }
  return at03;
}

function ruDayWordAgo(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  const mod10 = n % 10;
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/**
 * «Последнее: …» на плитке этапа: сутки с **03:00** по **локальному времени клиента** (Luxon `local`).
 * Внутри текущих суток — «менее часа назад» / «N часов назад»; предыдущие сутки (03:00–03:00) — «вчера»;
 * раньше — «N дней назад» (число полных таких суток между отметкой и «сейчас»).
 * Второй аргумент `fallbackIana` используется только при невалидном ISO (календарная подпись как раньше).
 */
export function formatRelativeTimeRu(
  iso: string,
  fallbackIana: string,
  now: DateTime = DateTime.now(),
): string {
  const t = DateTime.fromISO(iso, { setZone: true });
  if (!t.isValid) return formatRelativePatientCalendarDayRu(iso, fallbackIana, now);
  const tLocal = t.setZone("local");
  const nowLocal = now.setZone("local");
  if (!tLocal.isValid || !nowLocal.isValid) {
    return formatRelativePatientCalendarDayRu(iso, fallbackIana, now);
  }
  const diffMs = nowLocal.diff(tLocal).as("milliseconds");
  if (diffMs < 0) return formatRelativePatientCalendarDayRu(iso, fallbackIana, now);

  const startEvent = startOfLogicalDayAtThree(tLocal);
  const startNow = startOfLogicalDayAtThree(nowLocal);
  const slotDiffMs = startNow.toMillis() - startEvent.toMillis();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const slotDiffDays = Math.round(slotDiffMs / oneDayMs);

  if (slotDiffDays === 0) {
    if (diffMs < 60 * 60 * 1000) return "менее часа назад";
    const h = Math.max(1, Math.floor(diffMs / (60 * 60 * 1000)));
    return `${h} ${ruHourWord(h)} назад`;
  }
  if (slotDiffDays === 1) return "вчера";
  return `${slotDiffDays} ${ruDayWordAgo(slotDiffDays)} назад`;
}
