import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SYSTEM_PARENT_CODES } from "@/modules/content-sections/types";

export type ContentPagesSidebarSection = { slug: string; title: string };

const SYSTEM_FOLDER_LABELS: Record<(typeof SYSTEM_PARENT_CODES)[number], string> = {
  situations: "Ситуации",
  sos: "SOS",
  warmups: "Разминки",
  lessons: "Уроки",
};

const navBtnClass = cn(
  buttonVariants({ variant: "outline", size: "default" }),
  "h-auto min-h-10 w-full justify-start px-3 py-2 text-sm font-medium whitespace-normal",
);

function filterBtnClass(active: boolean) {
  return cn(
    buttonVariants({ variant: active ? "default" : "outline", size: "default" }),
    "h-auto min-h-9 w-full justify-start px-3 py-1.5 text-sm font-normal whitespace-normal",
  );
}

const CONTENT_BASE = "/app/doctor/content";

/** Левое меню хаба CMS: мотивации, разделы, статьи / системные папки. */
export function ContentPagesSidebar({
  articleSections,
  unassignedSectionNav,
  highlightArticleSlug,
  highlightSystemFolderCode,
}: {
  articleSections: ContentPagesSidebarSection[];
  /** Ссылка «Без раздела» для служебного раздела с перенесёнными страницами. */
  unassignedSectionNav?: { slug: string; title: string; pageCount: number } | null;
  /** Slug из `?section=` когда раздел — статья (`kind=article`). */
  highlightArticleSlug: string | null;
  /** Кластер из `?systemParentCode=` или выведенный из открытого системного раздела. */
  highlightSystemFolderCode: string | null;
}) {
  const allPagesActive = highlightArticleSlug === null && highlightSystemFolderCode === null;

  return (
    <nav
      className="flex w-full flex-col gap-2 md:w-64 md:shrink-0"
      aria-label="Контент и страницы"
    >
      <Link href={`${CONTENT_BASE}/motivation`} className={navBtnClass}>
        Мотивации
      </Link>
      <Separator className="my-1" />
      <Link href={`${CONTENT_BASE}/sections`} className={navBtnClass}>
        Разделы
      </Link>
      <Separator className="my-1" />
      <p className="px-1 text-xs font-medium text-muted-foreground">Статьи</p>
      <Link
        href={CONTENT_BASE}
        className={filterBtnClass(allPagesActive)}
        aria-current={allPagesActive ? "page" : undefined}
      >
        Все страницы
      </Link>
      {articleSections.map((s) => {
        const active = highlightArticleSlug === s.slug && highlightSystemFolderCode === null;
        return (
          <Link
            key={s.slug}
            href={`${CONTENT_BASE}?section=${encodeURIComponent(s.slug)}`}
            className={filterBtnClass(active)}
            aria-current={active ? "page" : undefined}
          >
            {s.title}
          </Link>
        );
      })}
      {unassignedSectionNav && unassignedSectionNav.pageCount > 0 ? (
        <Link
          href={`${CONTENT_BASE}?section=${encodeURIComponent(unassignedSectionNav.slug)}`}
          className={filterBtnClass(
            highlightArticleSlug === unassignedSectionNav.slug && highlightSystemFolderCode === null,
          )}
          aria-current={
            highlightArticleSlug === unassignedSectionNav.slug && highlightSystemFolderCode === null ?
              "page"
            : undefined
          }
        >
          {unassignedSectionNav.title}
        </Link>
      ) : null}
      <Separator className="my-1" />
      <p className="px-1 text-xs font-medium text-muted-foreground">Системные папки</p>
      {SYSTEM_PARENT_CODES.map((code) => {
        const active = highlightSystemFolderCode === code;
        return (
          <Link
            key={code}
            href={`${CONTENT_BASE}?systemParentCode=${encodeURIComponent(code)}`}
            className={filterBtnClass(active)}
            aria-current={active ? "page" : undefined}
          >
            {SYSTEM_FOLDER_LABELS[code]}
          </Link>
        );
      })}
    </nav>
  );
}
