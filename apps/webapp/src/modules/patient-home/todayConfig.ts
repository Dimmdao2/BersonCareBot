import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";

export type ResolvedWarmupPage = {
  slug: string;
  title: string;
  summary: string;
  imageUrl: string | null;
};

export type ResolvedPatientHomeBlockItem = {
  blockItem: PatientHomeBlockItem;
  page: ResolvedWarmupPage | null;
};

export type PatientHomeTodayConfigDeps = {
  patientHomeBlocks: { listBlocksWithItems(): Promise<PatientHomeBlock[]> };
  contentPages: { getBySlug(slug: string): Promise<ResolvedWarmupPage | null> };
  systemSettings: {
    getSetting(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null>;
  };
};

/** Парсит `patient_home_daily_practice_target` из `value_json` (обёртка `{ value }` или число). Default 3, clamp 1–10. */
export function parsePatientHomeDailyPracticeTarget(valueJson: unknown): number {
  let inner: unknown = valueJson;
  if (inner !== null && typeof inner === "object" && "value" in (inner as Record<string, unknown>)) {
    inner = (inner as { value: unknown }).value;
  }
  const n =
    typeof inner === "number" && Number.isFinite(inner)
      ? Math.round(inner)
      : typeof inner === "string" && /^\d+$/.test(inner.trim())
        ? Number.parseInt(inner.trim(), 10)
        : NaN;
  if (!Number.isFinite(n)) return 3;
  return Math.min(10, Math.max(1, n));
}

function mapPage(row: {
  slug: string;
  title: string;
  summary: string;
  imageUrl: string | null;
}): ResolvedWarmupPage {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    imageUrl: row.imageUrl,
  };
}

/**
 * Конфиг «Сегодня» для главной пациента (Phase 2): разминка из блока `daily_warmup` + целевое число практик.
 * Разминка не берётся из system_settings slug — только из `patient_home_block_items`.
 */
export async function getPatientHomeTodayConfig(
  deps: PatientHomeTodayConfigDeps,
): Promise<{ dailyWarmupItem: ResolvedPatientHomeBlockItem | null; practiceTarget: number }> {
  const setting = await deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin");
  const practiceTarget = parsePatientHomeDailyPracticeTarget(setting?.valueJson ?? null);

  const blocks = await deps.patientHomeBlocks.listBlocksWithItems();
  const warmupBlock = blocks.find((b) => b.code === "daily_warmup");
  if (!warmupBlock?.isVisible) {
    return { dailyWarmupItem: null, practiceTarget };
  }

  const items = [...warmupBlock.items]
    .filter((i) => i.isVisible && i.targetType === "content_page")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  for (const blockItem of items) {
    const slug = blockItem.targetRef.trim();
    if (!slug) continue;
    const row = await deps.contentPages.getBySlug(slug);
    if (!row) continue;
    return {
      dailyWarmupItem: { blockItem, page: mapPage(row) },
      practiceTarget,
    };
  }

  return { dailyWarmupItem: null, practiceTarget };
}
