import { redirect } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";

export default async function DoctorReferencesPage() {
  const deps = buildAppDeps();
  const workspace = await requireDoctorWorkspaceContext();
  const categories = await withDoctorWorkspacePrincipal(workspace, () => deps.references.listCategories());
  const first = categories[0];

  if (first) redirect(`/app/doctor/references/${encodeURIComponent(first.code)}`);

  return <p className="text-sm text-muted-foreground">Справочники не найдены.</p>;
}
