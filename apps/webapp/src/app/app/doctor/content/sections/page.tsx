import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { cn } from "@/lib/utils";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { DoctorSection } from "@/shared/ui/doctor/DoctorSection";
import { DataLoadFailureNotice } from "@/shared/ui/doctor/DataLoadFailureNotice";
import { ContentSectionsListClient } from "./ContentSectionsListClient";

export default async function DoctorContentSectionsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let pages: Awaited<ReturnType<typeof deps.contentPages.listAll>> = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    [sections, pages] = await Promise.all([deps.contentSections.listAll(), deps.contentPages.listAll()]);
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content/sections", err);
  }

  const isDev = process.env.NODE_ENV === "development";

  const pageCountBySection = new Map<string, number>();
  for (const p of pages) {
    pageCountBySection.set(p.section, (pageCountBySection.get(p.section) ?? 0) + 1);
  }

  /** Только каталог статей: разделы, перенесённые в системную папку CMS (`kind=system`), не показываем — они в дереве «Контент». */
  const catalogSections = sections.filter((s) => s.kind === "article");

  const initialSections = catalogSections.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    sortOrder: s.sortOrder,
    isVisible: s.isVisible,
    requiresAuth: s.requiresAuth,
    coverImageUrl: s.coverImageUrl,
    iconImageUrl: s.iconImageUrl,
    kind: s.kind,
    systemParentCode: s.systemParentCode,
    pagesInSection: pageCountBySection.get(s.slug) ?? 0,
  }));

  return (
    <DoctorAppShell title="Разделы контента" user={session.user} backHref="/app/doctor/content">
      <DoctorPageHeader
        title="Разделы контента"
        end={
          <Link href="/app/doctor/content/sections/new" className={cn(buttonVariants({ size: "sm" }))}>
            Создать раздел
          </Link>
        }
      />
      <DoctorSection id="doctor-content-sections-section">
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        <div id="doctor-content-sections-list">
          <ContentSectionsListClient initialSections={initialSections} />
        </div>
      </DoctorSection>
    </DoctorAppShell>
  );
}
