import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { ClinicalTestForm } from "../ClinicalTestForm";
import { CLINICAL_TESTS_PATH } from "../paths";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditClinicalTestPage({ params }: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await params;
  const deps = buildAppDeps();
  const test = await deps.clinicalTests.getClinicalTest(id);
  if (!test || test.isArchived) notFound();

  return (
    <AppShell title="Редактирование теста" user={session.user} variant="doctor" backHref={CLINICAL_TESTS_PATH}>
      <ClinicalTestForm test={test} />
    </AppShell>
  );
}
