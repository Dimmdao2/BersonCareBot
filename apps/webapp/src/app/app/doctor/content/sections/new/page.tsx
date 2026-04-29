import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { SectionForm } from "../SectionForm";

type PageProps = { searchParams?: Promise<{ suggestedSlug?: string | string[] }> };

function normalizeSuggestedSlug(raw: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase() ?? "";
  if (!s || !/^[a-z0-9-]+$/.test(s) || /^-+$/.test(s)) return undefined;
  return s;
}

export default async function DoctorContentSectionNewPage({ searchParams }: PageProps) {
  const session = await requireDoctorAccess();
  const sp = searchParams ? await searchParams : undefined;
  const initialSuggestedSlug = normalizeSuggestedSlug(sp?.suggestedSlug);

  return (
    <AppShell title="Новый раздел" user={session.user} variant="doctor" backHref="/app/doctor/content/sections">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        <SectionForm key={initialSuggestedSlug ?? "__new__"} initialSuggestedSlug={initialSuggestedSlug} />
      </section>
    </AppShell>
  );
}
