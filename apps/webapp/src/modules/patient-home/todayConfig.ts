import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import type { ContentSectionKind, SystemParentCode } from "@/modules/content-sections/types";
import { isPatientHomeContentPageCandidateForBlock } from "@/modules/patient-home/blocks";
import type { SystemSetting, SystemSettingKey, SystemSettingScope } from "@/modules/system-settings/types";

export type ResolvedWarmupPage = {
  /** `content_pages.id` — для проверок вроде cooldown после разминки на главной. */
  contentPageId: string;
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
  contentPages: {
    getBySlug(slug: string): Promise<(Pick<ResolvedWarmupPage, "slug" | "title" | "summary" | "imageUrl"> & { id: string; section: string }) | null>;
  };
  contentSections: {
    getBySlug(slug: string): Promise<{
      slug: string;
      kind: ContentSectionKind;
      systemParentCode: SystemParentCode | null;
    } | null>;
  };
  systemSettings: {
    getSetting(key: SystemSettingKey, scope: SystemSettingScope): Promise<SystemSetting | null>;
  };
};

/** Выбор разминки дня: cooldown по минутам и (опционально) пропуск страниц в паузе. */
export type PatientHomeWarmupPickContext = {
  userId: string;
  getDailyWarmupHeroCooldownMeta: (
    userId: string,
    contentPageId: string,
    cooldownMinutes: number,
  ) => Promise<{ active: boolean; minutesRemaining?: number }>;
  cooldownMinutes: number;
  /** Если true — пропускать страницы в hero-cooldown и брать следующую доступную. */
  skipCooldownPages: boolean;
};

export type PatientHomeTodayConfigResult = {
  dailyWarmupItem: ResolvedPatientHomeBlockItem | null;
  practiceTarget: number;
  /** Все видимые разминки дня сейчас в cooldown — показываем финальный hero «выполнено». */
  allDailyWarmupsInCooldown: boolean;
  /** Минимум из `minutesRemaining` по страницам, если `allDailyWarmupsInCooldown`. */
  allDailyWarmupsCooldownMinutesRemaining: number | null;
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
  id: string;
  slug: string;
  title: string;
  summary: string;
  imageUrl: string | null;
}): ResolvedWarmupPage {
  return {
    contentPageId: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    imageUrl: row.imageUrl,
  };
}

/**
 * Конфиг «Сегодня» для главной пациента (Phase 2): разминка из блока `daily_warmup` + целевое число практик.
 * Разминка не берётся из system_settings slug — только из `patient_home_block_items`.
 * @param warmupWeekdayMonday0 день недели в таймзоне приложения: 0 = понедельник, 6 = воскресенье. Ротация выбранного материала по `sortOrder`.
 */
export async function getPatientHomeTodayConfig(
  deps: PatientHomeTodayConfigDeps,
  warmupWeekdayMonday0 = 0,
  warmupPick?: PatientHomeWarmupPickContext,
): Promise<PatientHomeTodayConfigResult> {
  const setting = await deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin");
  const practiceTarget = parsePatientHomeDailyPracticeTarget(setting?.valueJson ?? null);

  const blocks = await deps.patientHomeBlocks.listBlocksWithItems();
  const warmupBlock = blocks.find((b) => b.code === "daily_warmup");
  if (!warmupBlock?.isVisible) {
    return {
      dailyWarmupItem: null,
      practiceTarget,
      allDailyWarmupsInCooldown: false,
      allDailyWarmupsCooldownMinutesRemaining: null,
    };
  }

  const items = [...warmupBlock.items]
    .filter((i) => i.isVisible && i.targetType === "content_page")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const n = items.length;
  if (n === 0) {
    return {
      dailyWarmupItem: null,
      practiceTarget,
      allDailyWarmupsInCooldown: false,
      allDailyWarmupsCooldownMinutesRemaining: null,
    };
  }

  const start = ((warmupWeekdayMonday0 % n) + n) % n;
  let minMinutesWhenAllInCooldown: number | null = null;
  let sawAnyValidCandidate = false;

  for (let step = 0; step < n; step++) {
    const blockItem = items[(start + step) % n]!;
    const slug = blockItem.targetRef.trim();
    if (!slug) continue;
    const row = await deps.contentPages.getBySlug(slug);
    if (!row) continue;
    const parent = await deps.contentSections.getBySlug(row.section);
    const sectionMap = parent
      ? new Map([[parent.slug, { kind: parent.kind, systemParentCode: parent.systemParentCode }]])
      : new Map<string, { kind: ContentSectionKind; systemParentCode: SystemParentCode | null }>();
    if (
      !isPatientHomeContentPageCandidateForBlock(
        "daily_warmup",
        {
          slug: row.slug,
          section: row.section,
          isPublished: true,
          archivedAt: null,
          deletedAt: null,
        },
        sectionMap,
      )
    ) {
      continue;
    }
    sawAnyValidCandidate = true;

    if (warmupPick?.skipCooldownPages) {
      const meta = await warmupPick.getDailyWarmupHeroCooldownMeta(
        warmupPick.userId,
        row.id,
        warmupPick.cooldownMinutes,
      );
      if (meta.active) {
        const rem =
          typeof meta.minutesRemaining === "number" && Number.isFinite(meta.minutesRemaining) ?
            meta.minutesRemaining
          : 1;
        minMinutesWhenAllInCooldown =
          minMinutesWhenAllInCooldown === null ? rem : Math.min(minMinutesWhenAllInCooldown, rem);
        continue;
      }
    }

    return {
      dailyWarmupItem: { blockItem, page: mapPage(row) },
      practiceTarget,
      allDailyWarmupsInCooldown: false,
      allDailyWarmupsCooldownMinutesRemaining: null,
    };
  }

  const allDailyWarmupsInCooldown = Boolean(warmupPick?.skipCooldownPages && warmupPick && sawAnyValidCandidate);
  return {
    dailyWarmupItem: null,
    practiceTarget,
    allDailyWarmupsInCooldown,
    allDailyWarmupsCooldownMinutesRemaining: allDailyWarmupsInCooldown ? minMinutesWhenAllInCooldown : null,
  };
}
