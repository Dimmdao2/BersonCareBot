import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { MeasureKindsTableClient } from "./MeasureKindsTableClient";

export default async function DoctorMeasureKindsReferencePage() {
  const deps = buildAppDeps();
  const items = await deps.measureKinds.listMeasureKinds();
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
