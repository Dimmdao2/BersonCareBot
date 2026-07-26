import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { MeasureKindsTableClient } from "./MeasureKindsTableClient";

export default async function DoctorMeasureKindsReferencePage() {
  // The enclosing layout resolves its own workspace principal, but a layout's
  // `enterWith*` never reaches a sibling page's async context — the page then reads with the
  // BOOTSTRAP principal, which routes to the nonstaff pool and runs `RESET ROLE`, i.e. as the bare
  // login role (`bcb_*_runtime_nonstaff_login`) with no table grants at all. That is the
  // `permission denied for table clinical_test_measure_kinds` 500. Resolve the principal HERE, the
  // same way the sibling `[categoryCode]` page does, so the read runs as `app_staff`.
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const items = await withDoctorWorkspacePrincipal(workspace, () => deps.measureKinds.listMeasureKinds());
  return (
    <MeasureKindsTableClient
      initialItems={items.map((it) => ({
        id: it.id,
        code: it.code,
        label: it.label,
        sortOrder: it.sortOrder,
      }))}
    />
  );
}
