import Link from "next/link";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageSection } from "@/components/common/layout/PageSection";
import { SectionHeading } from "@/components/common/typography/SectionHeading";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { cn } from "@/lib/utils";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { ContentSectionsListClient } from "./ContentSectionsListClient";

export default async function DoctorContentSectionsPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();

  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    sections = await deps.contentSections.listAll();
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content/sections", err);
  }

  const isDev = process.env.NODE_ENV === "development";

  const initialSections = sections.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    sortOrder: s.sortOrder,
    isVisible: s.isVisible,
    requiresAuth: s.requiresAuth,
    coverImageUrl: s.coverImageUrl,
    iconImageUrl: s.iconImageUrl,
  }));

  return (
    <AppShell title="Разделы контента" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <PageSection id="doctor-content-sections-section" as="section" className="flex flex-col gap-4">
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading level="subsection" className="m-0">
            Разделы
          </SectionHeading>
          <Link href="/app/doctor/content/sections/new" className={cn(buttonVariants({ size: "sm" }))}>
            Создать раздел
          </Link>
        </div>
        <div id="doctor-content-sections-list">
          <ContentSectionsListClient initialSections={initialSections} />
        </div>
      </PageSection>
    </AppShell>
  );
}
