const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProductAnalyticsPageKeyOptions = {
  /** CMS content slug belongs to warmups cluster (`content_sections.system_parent_code = warmups`). */
  isWarmupContent?: boolean;
};

/** Raw `/app/patient/content/<slug>` segment for warmup detection at ingest. */
export function patientContentSlugFromPath(pathname: string): string | null {
  const trimmed = pathname.trim();
  const pathOnly = (trimmed.split("?")[0] ?? trimmed).replace(/\/+$/, "");
  const parts = pathOnly.split("/").filter(Boolean);
  if (parts[0] !== "app" || parts[1] !== "patient" || parts[2] !== "content") return null;
  const slug = parts[3];
  if (!slug || UUID_RE.test(slug) || slug === ":slug") return null;
  return slug;
}

const STATIC_PAGE_LABELS: Record<string, string> = {
  "/app/patient/home": "Главная",
  "/app/patient/diary": "Дневник",
  "/app/patient/cabinet": "Кабинет",
  "/app/patient/profile": "Профиль",
  "/app/patient/reminders": "Напоминания",
  "/app/patient/notifications": "Уведомления",
  "/app/patient/messages": "Сообщения",
  "/app/patient/support": "Поддержка",
  "/app/patient/booking": "Запись на приём",
  "/app/patient/courses": "Курсы",
  "/app/patient/lessons": "Уроки",
  "/app/patient/purchases": "Покупки",
  "/app/patient/about": "О сервисе",
  "/app/patient/install": "Установка приложения",
  "/app/patient/treatment/program": "Программа реабилитации",
  "/app/patient/treatment/overview": "Программа реабилитации",
  "/app/patient/warmup": "Страница разминки",
  "/app/patient/content/page": "Страница контента",
};

/** Collapse normalized keys for analytics (ingest + historical rollup). */
export function groupProductAnalyticsPageKey(pageKey: string): string {
  const key = pageKey.trim();
  if (!key.startsWith("/app/patient")) return key;

  if (key.startsWith("/app/patient/treatment")) {
    return "/app/patient/treatment/program";
  }
  if (key === "/app/patient/go/daily-warmup" || key === "/app/patient/warmup") {
    return "/app/patient/warmup";
  }
  if (key === "/app/patient/go/plan-start-lesson") {
    return "/app/patient/treatment/program";
  }
  if (key.startsWith("/app/patient/go/")) {
    return key;
  }
  if (key.startsWith("/app/patient/booking")) {
    return "/app/patient/booking";
  }
  if (key.startsWith("/app/patient/content/")) {
    return "/app/patient/content/page";
  }
  if (key.startsWith("/app/patient/help/") || key === "/app/patient/help") {
    return "/app/patient/help";
  }
  if (key.startsWith("/app/patient/sections/") || key === "/app/patient/sections") {
    return "/app/patient/sections";
  }
  if (key.startsWith("/app/patient/memberships/")) {
    return "/app/patient/memberships";
  }
  if (key.startsWith("/app/patient/broadcasts/")) {
    return "/app/patient/broadcasts";
  }
  if (key.startsWith("/app/patient/intake/")) {
    return "/app/patient/intake";
  }
  if (key.startsWith("/app/patient/diary/")) {
    return "/app/patient/diary";
  }

  return key;
}

export function labelProductAnalyticsPageKey(groupKey: string): string {
  const known = STATIC_PAGE_LABELS[groupKey];
  if (known) return known;

  const tail = groupKey
    .replace(/^\/app\/patient\/?/, "")
    .split("/")
    .filter(Boolean)
    .join(" · ");
  return tail || "Кабинет пациента";
}

/** Final normalization after uuid/slug folding. */
export function finalizeProductAnalyticsPageKey(
  normalizedPath: string,
  opts?: ProductAnalyticsPageKeyOptions,
): string {
  if (opts?.isWarmupContent && normalizedPath.startsWith("/app/patient/content/")) {
    return "/app/patient/warmup";
  }
  return groupProductAnalyticsPageKey(normalizedPath);
}
