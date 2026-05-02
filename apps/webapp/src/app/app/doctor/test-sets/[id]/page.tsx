import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { TestSetForm } from "../TestSetForm";
import { TestSetItemsForm } from "../TestSetItemsForm";
import { TEST_SETS_PATH } from "../paths";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditTestSetPage({ params }: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await params;
  const deps = buildAppDeps();
  const testSet = await deps.testSets.getTestSet(id);
  if (!testSet) notFound();
  const usage = await deps.testSets.getTestSetUsage(testSet.id);

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
          {" — скопируйте UUID нужных строк в состав набора ниже."}
        </p>
        <TestSetForm testSet={testSet} externalUsageSnapshot={usage} />
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Состав набора</h2>
          {!testSet.isArchived ? (
            <TestSetItemsForm testSet={testSet} />
          ) : (
            <p className="text-sm text-muted-foreground">Состав недоступен, пока набор в архиве.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
