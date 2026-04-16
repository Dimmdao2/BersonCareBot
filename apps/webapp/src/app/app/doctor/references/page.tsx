import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export default async function DoctorReferencesPage() {
  const deps = buildAppDeps();
  const categories = await deps.references.listCategories();
  const first = categories[0];

  if (first) redirect(`/app/doctor/references/${encodeURIComponent(first.code)}`);

  return <p className="text-sm text-muted-foreground">Справочники не найдены.</p>;
}
