"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { Separator } from "@/shared/ui/doctor/primitives/separator";
import { Plus } from "lucide-react";
import {
  CMS_UNASSIGNED_SECTION_SLUG,
  isHelpSectionSlug,
  SYSTEM_PARENT_CODES,
} from "@/modules/content-sections/types";

// ---------------------------------------------------------------------------
// Pane key types
// ---------------------------------------------------------------------------

export type ContentNavPaneKey =
  | "patient-home"
  | "warmups"
  | "sos"
  | "situations"
  | "lessons"
  | `section:${string}`
  | "media";

export type ContentNavSectionEntry = {
  slug: string;
  title: string;
  isVisible: boolean;
};

export type ContentNavProps = {
  articleSections: ContentNavSectionEntry[];
  activePaneKey: ContentNavPaneKey;
  onPaneChange: (key: ContentNavPaneKey) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYSTEM_FOLDER_LABELS: Record<(typeof SYSTEM_PARENT_CODES)[number], string> = {
  situations: "Ситуации",
  sos: "SOS",
  warmups: "Разминки",
  lessons: "Уроки · Новости · Мотивации",
};

const CONTENT_BASE = "/app/doctor/content";

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: active ? "default" : "outline", size: "default" }),
        "h-auto min-h-9 w-full justify-start px-3 py-1.5 text-sm font-normal whitespace-normal",
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ContentNav
// ---------------------------------------------------------------------------

/**
 * Left-navigation panel for the Контент hub.
 * Client-side panel switcher — no full-page navigations.
 * Active pane key is kept in parent state + synced to ?section= URL param.
 */
export function ContentNav({ articleSections, activePaneKey, onPaneChange }: ContentNavProps) {
  const userSections = articleSections.filter(
    (s) => s.slug !== CMS_UNASSIGNED_SECTION_SLUG && !isHelpSectionSlug(s.slug),
  );

  return (
    <nav
      className="flex w-full flex-col gap-1.5 md:w-64 md:shrink-0"
      aria-label="Контент и страницы"
    >
      {/* ── Системные разделы ── */}
      <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Системные разделы
      </p>
      <Link
        href="/app/doctor/patient-home"
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "h-auto min-h-9 w-full justify-start px-3 py-1.5 text-sm font-normal whitespace-normal",
        )}
      >
        Главная пациента
      </Link>
      {SYSTEM_PARENT_CODES.map((code) => (
        <NavItem
          key={code}
          label={SYSTEM_FOLDER_LABELS[code]}
          active={activePaneKey === code}
          onClick={() => onPaneChange(code)}
        />
      ))}

      <Separator className="my-1" />

      {/* ── Статьи и страницы ── */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Статьи и страницы
        </p>
        <Link
          href={`${CONTENT_BASE}/sections/new`}
          className="inline-flex items-center justify-center rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Создать раздел"
          aria-label="Создать раздел"
        >
          <Plus className="size-3.5" aria-hidden />
        </Link>
      </div>

      {userSections.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">Нет пользовательских разделов.</p>
      ) : (
        userSections.map((s) => (
          <NavItem
            key={s.slug}
            label={s.title}
            active={activePaneKey === `section:${s.slug}`}
            onClick={() => onPaneChange(`section:${s.slug}`)}
          />
        ))
      )}

      <Separator className="my-1" />

      {/* ── Медиа ── */}
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Медиа
      </p>
      <Link
        href={`${CONTENT_BASE}/library`}
        className={cn(
          buttonVariants({ variant: "outline", size: "default" }),
          "h-auto min-h-9 w-full justify-start px-3 py-1.5 text-sm font-normal whitespace-normal",
        )}
      >
        Файлы и медиа
      </Link>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// URL-sync hook (mirrors DoctorAnalyticsShell / DoctorScheduleShell pattern)
// ---------------------------------------------------------------------------

const CONTENT_HUB_PATH = "/app/doctor/content";

function paneKeyToUrlParam(key: ContentNavPaneKey): string {
  if (key.startsWith("section:")) return `section_${key.slice("section:".length)}`;
  return key;
}

function urlParamToPaneKey(raw: string | null, articleSlugs: string[]): ContentNavPaneKey | null {
  if (!raw) return null;
  // section_ prefix → article section
  if (raw.startsWith("section_")) {
    const slug = raw.slice("section_".length);
    if (articleSlugs.includes(slug)) return `section:${slug}`;
    return null;
  }
  // system pane keys
  if (
    raw === "patient-home" ||
    raw === "warmups" ||
    raw === "sos" ||
    raw === "situations" ||
    raw === "lessons" ||
    raw === "media"
  ) {
    return raw;
  }
  return null;
}

function defaultPaneKey(articleSections: ContentNavSectionEntry[]): ContentNavPaneKey {
  const first = articleSections.find(
    (s) => s.slug !== CMS_UNASSIGNED_SECTION_SLUG && !isHelpSectionSlug(s.slug),
  );
  if (first) return `section:${first.slug}`;
  return "warmups";
}

/**
 * Hook that owns the active-pane state for the Контент hub:
 *  - reads ?section= on mount
 *  - syncs via history.replaceState on change
 *  - restores via popstate (back/forward)
 */
export function useContentNavState(articleSections: ContentNavSectionEntry[]): {
  activePaneKey: ContentNavPaneKey;
  setActivePaneKey: (key: ContentNavPaneKey) => void;
} {
  const articleSlugs = articleSections
    .filter((s) => s.slug !== CMS_UNASSIGNED_SECTION_SLUG && !isHelpSectionSlug(s.slug))
    .map((s) => s.slug);

  const resolveInitial = (): ContentNavPaneKey => {
    if (typeof window === "undefined") return defaultPaneKey(articleSections);
    const raw = new URLSearchParams(window.location.search).get("section");
    return urlParamToPaneKey(raw, articleSlugs) ?? defaultPaneKey(articleSections);
  };

  const [activePaneKey, setActivePaneKeyState] = useState<ContentNavPaneKey>(resolveInitial);
  const activeRef = useRef(activePaneKey);
  useEffect(() => {
    activeRef.current = activePaneKey;
  }, [activePaneKey]);

  // Restore on popstate (back/forward)
  useEffect(() => {
    const articleSlugsClosure = articleSlugs;
    const handler = () => {
      const raw = new URLSearchParams(window.location.search).get("section");
      const key = urlParamToPaneKey(raw, articleSlugsClosure) ?? defaultPaneKey(articleSections);
      setActivePaneKeyState(key);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActivePaneKey = useCallback(
    (key: ContentNavPaneKey) => {
      setActivePaneKeyState(key);
      const param = paneKeyToUrlParam(key);
      window.history.replaceState(null, "", `${CONTENT_HUB_PATH}?section=${param}`);
    },
    [],
  );

  return { activePaneKey, setActivePaneKey };
}
