import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetForm } from "../TestSetForm";
import { TEST_SETS_PATH } from "../paths";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { clinicalTestLibraryRows } from "../clinicalTestLibraryRows";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditTestSetPage({ params }: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await params;
  const deps = buildAppDeps();
  const testSet = await deps.testSets.getTestSet(id);
  if (!testSet) notFound();
  const usage = await deps.testSets.getTestSetUsage(testSet.id);
  const clinicalTestsForPicker = await deps.clinicalTests.listClinicalTests({ archiveScope: "active" });
  const clinicalTestsLibrary = clinicalTestLibraryRows(clinicalTestsForPicker);

  return (
    <AppShell title="Набор тестов" user={session.user} variant="doctor" backHref={TEST_SETS_PATH}>
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted-foreground">
          <Link
            href="/app/doctor/clinical-tests"
            className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}
          >
            Библиотека тестов
          </Link>
          {" — добавляйте тесты через кнопку «Добавить из библиотеки» в составе набора."}
        </p>
        <TestSetForm testSet={testSet} externalUsageSnapshot={usage} clinicalTestsLibrary={clinicalTestsLibrary} />
      </div>
    </AppShell>
  );
}
