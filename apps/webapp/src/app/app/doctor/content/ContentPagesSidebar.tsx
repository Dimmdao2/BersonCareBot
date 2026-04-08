import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type ContentPagesSidebarSection = { slug: string; title: string };

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

/** Левое меню хаба CMS: новости, мотивации, разделы, фильтр по разделам, библиотека. */
export function ContentPagesSidebar({
  sections,
  activeSectionSlug,
}: {
  sections: ContentPagesSidebarSection[];
  activeSectionSlug: string | null;
}) {
  return (
    <nav
      className="flex w-full flex-col gap-2 md:w-64 md:shrink-0"
      aria-label="Контент и страницы"
    >
      <Link href={`${CONTENT_BASE}/news`} className={navBtnClass}>
        Новости
      </Link>
      <Link href={`${CONTENT_BASE}/motivation`} className={navBtnClass}>
        Мотивации
      </Link>
      <Separator className="my-1" />
      <Link href={`${CONTENT_BASE}/sections`} className={navBtnClass}>
        Разделы
      </Link>
      <Separator className="my-1" />
      <p className="px-1 text-xs font-medium text-muted-foreground">Страницы</p>
      <Link
        href={CONTENT_BASE}
        className={filterBtnClass(activeSectionSlug === null)}
        aria-current={activeSectionSlug === null ? "page" : undefined}
      >
        Все страницы
      </Link>
      {sections.map((s) => {
        const active = activeSectionSlug === s.slug;
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
      <Separator className="my-1" />
      <Link href={`${CONTENT_BASE}/library`} className={navBtnClass}>
        Библиотека файлов
      </Link>
    </nav>
  );
}
