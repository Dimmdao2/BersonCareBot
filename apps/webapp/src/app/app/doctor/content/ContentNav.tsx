"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/shared/ui/doctor/primitives/separator";
import { Eye, EyeOff } from "lucide-react";
import {
  CMS_UNASSIGNED_SECTION_SLUG,
  isHelpSectionSlug,
  SYSTEM_PARENT_CODES,
} from "@/modules/content-sections/types";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { setSectionVisibility } from "./sections/sectionVisibilityActions";

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
  /** Count of pages per pane key (warmups|sos|situations|lessons|section:<slug>). */
  countsByPaneKey?: Record<string, number>;
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

/** Pane keys hidden from the nav (stubs/removed sections). */
const HIDDEN_SYSTEM_CODES = new Set<string>(["lessons"]);

const CONTENT_BASE = "/app/doctor/content";

// ---------------------------------------------------------------------------
// Lightweight nav row — file-tree list style
// ---------------------------------------------------------------------------

function NavRow({
  label,
  active,
  count,
  onClick,
  trailingSlot,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
  trailingSlot?: React.ReactNode;
}) {
  return (
    <div className="group relative flex items-center">
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        className={cn(
          "flex flex-1 min-w-0 items-center gap-1 rounded-md py-1.5 pl-2.5 pr-2 text-sm whitespace-normal text-left transition-colors",
          active
            ? "border-l-2 border-primary bg-primary/10 font-medium text-foreground"
            : "border-l-2 border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
      >
        <span className="flex-1 min-w-0">{label}</span>
        {typeof count === "number" && count > 0 ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
        ) : null}
      </button>
      {trailingSlot ? (
        <div className="shrink-0 pl-0.5">{trailingSlot}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentNav
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SectionVisibilityToggle — eye icon button for a single user section
// ---------------------------------------------------------------------------

function SectionVisibilityToggle({
  slug,
  isVisible,
  onToggle,
  disabled,
}: {
  slug: string;
  isVisible: boolean;
  onToggle: (slug: string, next: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={isVisible ? "Скрыть раздел" : "Показать раздел"}
      title={isVisible ? "Скрыть раздел" : "Показать раздел"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(slug, !isVisible);
      }}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent",
        "hover:bg-muted hover:border-border",
        "disabled:pointer-events-none disabled:opacity-40",
        "transition-colors",
      )}
    >
      {isVisible ? (
        <Eye className="size-4 text-green-600 dark:text-green-500" aria-hidden />
      ) : (
        <EyeOff className="size-4 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Local visibility state entry
// ---------------------------------------------------------------------------

type SectionVisState = { slug: string; title: string; isVisible: boolean };

/**
 * Left-navigation panel for the Контент hub.
 * Client-side panel switcher — no full-page navigations.
 * Active pane key is kept in parent state + synced to ?section= URL param.
 */
export function ContentNav({
  articleSections,
  activePaneKey,
  onPaneChange,
  countsByPaneKey = {},
}: ContentNavProps) {
  const baseUserSections: SectionVisState[] = useMemo(
    () =>
      articleSections
        .filter((s) => s.slug !== CMS_UNASSIGNED_SECTION_SLUG && !isHelpSectionSlug(s.slug))
        .map((s) => ({ slug: s.slug, title: s.title, isVisible: s.isVisible })),
    [articleSections],
  );
  const [visibilityOverrides, setVisibilityOverrides] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const userSections = useMemo(
    () =>
      baseUserSections.map((section) => ({
        ...section,
        isVisible: visibilityOverrides[section.slug] ?? section.isVisible,
      })),
    [baseUserSections, visibilityOverrides],
  );

  const handleVisibilityToggle = useCallback(
    (slug: string, nextIsVisible: boolean) => {
      // Optimistic update
      setVisibilityOverrides((prev) => ({ ...prev, [slug]: nextIsVisible }));

      startTransition(async () => {
        const result = await setSectionVisibility(slug, nextIsVisible);
        if (!result.ok) {
          // Revert on failure
          setVisibilityOverrides((prev) => ({ ...prev, [slug]: !nextIsVisible }));
        }
      });
    },
    [],
  );

  return (
    <nav
      className="flex w-full flex-col gap-0.5 md:w-56 md:shrink-0"
      aria-label="Контент и страницы"
    >
      {/* ── Системные разделы ── */}
      <p className="px-2.5 pt-1 pb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Системные разделы
      </p>

      {/* Главная пациента — in-pane (keeps ContentNav visible) */}
      <NavRow
        label="Главная пациента"
        active={activePaneKey === "patient-home"}
        onClick={() => onPaneChange("patient-home")}
      />

      {SYSTEM_PARENT_CODES.filter((code) => !HIDDEN_SYSTEM_CODES.has(code)).map((code) => (
        <NavRow
          key={code}
          label={SYSTEM_FOLDER_LABELS[code]}
          active={activePaneKey === code}
          count={countsByPaneKey[code]}
          onClick={() => onPaneChange(code)}
        />
      ))}

      <Separator className="my-1.5" />

      {/* ── Статьи и страницы ── */}
      <div className="flex items-center justify-between px-2.5 pb-0.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Статьи и страницы
        </p>
        <Link
          href={`${CONTENT_BASE}/sections/new`}
          aria-label="Создать раздел"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-6 px-2 text-xs")}
        >
          + Раздел
        </Link>
      </div>

      {userSections.length === 0 ? (
        <p className="px-2.5 text-xs text-muted-foreground">Нет пользовательских разделов.</p>
      ) : (
        userSections.map((s) => (
          <NavRow
            key={s.slug}
            label={s.title}
            active={activePaneKey === `section:${s.slug}`}
            count={countsByPaneKey[`section:${s.slug}`]}
            onClick={() => onPaneChange(`section:${s.slug}`)}
            trailingSlot={
              <SectionVisibilityToggle
                slug={s.slug}
                isVisible={s.isVisible}
                onToggle={handleVisibilityToggle}
                disabled={isPending}
              />
            }
          />
        ))
      )}

      <Separator className="my-1.5" />

      {/* ── Медиа ── */}
      <p className="px-2.5 pb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Медиа
      </p>

      {/* ── Hint blurb (#11) ── */}
      <p className="mt-2 px-2.5 text-xs text-muted-foreground leading-relaxed">
        Системные разделы не удаляются. «Статьи и страницы» — ваши собственные.
      </p>
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
