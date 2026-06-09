import type { PatientHomeBlock, PatientHomeBlockItem } from "@/modules/patient-home/ports";
import type { ContentSectionKind, SystemParentCode } from "@/modules/content-sections/types";
import { isPatientHomeContentPageCandidateForBlock } from "@/modules/patient-home/blocks";
import type { DailyWarmupPresentationSyncDeps } from "@/modules/patient-home/ensureDailyWarmupPresentationSynced";
import { ensureDailyWarmupPresentationSynced } from "@/modules/patient-home/ensureDailyWarmupPresentationSynced";
import { pickDailyWarmupFromOrderedList } from "@/modules/patient-home/pickDailyWarmupFromOrderedList";
import { resolveDailyWarmupHomePickIndex } from "@/modules/patient-home/resolveDailyWarmupHomePickIndex";
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

export type PatientHomeWarmupPickTier = "guest" | "no_tier" | "patient";

/** Контекст выбора разминки дня для patient tier. */
export type PatientHomeWarmupPickContext = {
  tier: PatientHomeWarmupPickTier;
  userId?: string;
  getLatestCompletedContentPageId?: (userId: string) => Promise<string | null>;
  /** Последняя разминка, зафиксированная при открытии push-напоминания. */
  getPresentedContentPageId?: (userId: string) => Promise<string | null>;
};

export type DailyWarmupPickConsumer = "home" | "push_reminder";

export type PatientHomeTodayConfigResult = {
  dailyWarmupItem: ResolvedPatientHomeBlockItem | null;
  practiceTarget: number;
  /** Число доступных разминок в блоке (для cooldown UI при n===1). */
  dailyWarmupCount: number;
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

export type DailyWarmupListEntry = ResolvedWarmupPage & {
  blockItem: PatientHomeBlockItem;
};

/**
 * Упорядоченный список опубликованных разминок из блока главной `daily_warmup` (для pager и ротации дня).
 */
export async function listDailyWarmupPagesForHome(
  deps: PatientHomeTodayConfigDeps,
): Promise<DailyWarmupListEntry[]> {
  const blocks = await deps.patientHomeBlocks.listBlocksWithItems();
  const warmupBlock = blocks.find((b) => b.code === "daily_warmup");
  if (!warmupBlock?.isVisible) return [];

  const items = [...warmupBlock.items]
    .filter((i) => i.isVisible && i.targetType === "content_page")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const result: DailyWarmupListEntry[] = [];
  for (const blockItem of items) {
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
    result.push({ ...mapPage(row), blockItem });
  }
  return result;
}

/** Membership в блоке `daily_warmup` по `content_pages.id`. */
export async function isContentPageInDailyWarmupBlock(
  contentPageId: string,
  deps: PatientHomeTodayConfigDeps,
): Promise<boolean> {
  const pages = await listDailyWarmupPagesForHome(deps);
  return pages.some((p) => p.contentPageId === contentPageId);
}

export type PatientDailyWarmupNav = {
  index: number;
  total: number;
  prevHref: string;
  nextHref: string;
};

export function buildPatientDailyWarmupNav(
  slug: string,
  pages: ReadonlyArray<Pick<ResolvedWarmupPage, "slug">>,
): PatientDailyWarmupNav | null {
  const total = pages.length;
  if (total <= 1) return null;
  const index = pages.findIndex((p) => p.slug === slug);
  if (index < 0) return null;
  const hrefFor = (s: string) =>
    `/app/patient/content/${encodeURIComponent(s)}?from=daily_warmup`;
  const prev = pages[(index - 1 + total) % total]!;
  const next = pages[(index + 1) % total]!;
  return {
    index,
    total,
    prevHref: hrefFor(prev.slug),
    nextHref: hrefFor(next.slug),
  };
}

export async function resolveDailyWarmupPickIndex(
  pages: ReadonlyArray<Pick<DailyWarmupListEntry, "contentPageId">>,
  pickContext?: PatientHomeWarmupPickContext,
  consumer: DailyWarmupPickConsumer = "home",
  presentationSyncDeps?: DailyWarmupPresentationSyncDeps,
): Promise<number> {
  if (pages.length === 0) return 0;
  if (!pickContext || pickContext.tier !== "patient" || !pickContext.userId) {
    return 0;
  }

  const userId = pickContext.userId;
  let presentedId: string | null = null;
  if (presentationSyncDeps) {
    presentedId = await ensureDailyWarmupPresentationSynced(userId, presentationSyncDeps);
  } else if (pickContext.getPresentedContentPageId) {
    presentedId = await pickContext.getPresentedContentPageId(userId);
  }

  const lastCompletedId = pickContext.getLatestCompletedContentPageId
    ? await pickContext.getLatestCompletedContentPageId(userId)
    : null;

  const homeIndex = resolveDailyWarmupHomePickIndex(pages, presentedId, lastCompletedId);
  if (consumer === "home") return homeIndex;

  const homePageId = pages[homeIndex]?.contentPageId ?? presentedId;
  return pickDailyWarmupFromOrderedList(pages, homePageId);
}

/**
 * Конфиг «Сегодня» для главной пациента: разминка из блока `daily_warmup` + целевое число практик.
 * Ротация (patient): lazy sync presented; главная — synced presented или следующая после last completed; push — следующая после home pick.
 */
export async function getPatientHomeTodayConfig(
  deps: PatientHomeTodayConfigDeps,
  pickContext?: PatientHomeWarmupPickContext,
  presentationSyncDeps?: DailyWarmupPresentationSyncDeps,
): Promise<PatientHomeTodayConfigResult> {
  const setting = await deps.systemSettings.getSetting("patient_home_daily_practice_target", "admin");
  const practiceTarget = parsePatientHomeDailyPracticeTarget(setting?.valueJson ?? null);

  const dailyPages = await listDailyWarmupPagesForHome(deps);
  const n = dailyPages.length;
  if (n === 0) {
    return {
      dailyWarmupItem: null,
      practiceTarget,
      dailyWarmupCount: 0,
    };
  }

  const pickIndex = await resolveDailyWarmupPickIndex(
    dailyPages,
    pickContext,
    "home",
    presentationSyncDeps,
  );
  const entry = dailyPages[pickIndex]!;
  const { blockItem, ...page } = entry;

  return {
    dailyWarmupItem: { blockItem, page },
    practiceTarget,
    dailyWarmupCount: n,
  };
}
