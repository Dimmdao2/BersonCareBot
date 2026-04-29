import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logServerRuntimeError } from "@/infra/logging/serverRuntimeLog";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DataLoadFailureNotice } from "@/shared/ui/DataLoadFailureNotice";
import { parsePatientHomeCmsReturnQuery } from "@/modules/patient-home/patientHomeCmsReturnUrls";
import { ContentForm } from "../ContentForm";

function pick(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export default async function DoctorContentNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  let sections: Awaited<ReturnType<typeof deps.contentSections.listAll>> = [];
  let loadError: ReturnType<typeof logServerRuntimeError> | null = null;
  try {
    sections = await deps.contentSections.listAll();
  } catch (err) {
    loadError = logServerRuntimeError("app/doctor/content/new", err);
  }

  const sp = await searchParams;
  const patientHomeContext = parsePatientHomeCmsReturnQuery({
    returnTo: pick(sp, "returnTo"),
    patientHomeBlock: pick(sp, "patientHomeBlock"),
    suggestedTitle: pick(sp, "suggestedTitle"),
    suggestedSlug: pick(sp, "suggestedSlug"),
  });

  const isDev = process.env.NODE_ENV === "development";

  return (
    <AppShell title="Новая страница" user={session.user} variant="doctor" backHref="/app/doctor/content">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm flex flex-col gap-4">
        {loadError ? (
          <DataLoadFailureNotice
            digest={loadError.digest}
            devMessage={isDev ? `${loadError.name}: ${loadError.message}` : undefined}
          />
        ) : null}
        <ContentForm sections={sections} patientHomeContext={patientHomeContext} />
      </section>
    </AppShell>
  );
}
