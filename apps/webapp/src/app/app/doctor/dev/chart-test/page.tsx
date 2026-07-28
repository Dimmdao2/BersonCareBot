/**
 * DEV-ONLY: Chart test page for ExerciseExecutionGraph acceptance.
 * Route: /app/doctor/dev/chart-test?instanceId=...&stageItemId=...&userId=...
 *
 * Remove or gate behind IS_DEV before production merge.
 */
import { requireDoctorWorkspaceContext } from "@/app-layer/guards/requireRole";
import { ChartTestPageClient } from "./ChartTestPageClient";

export default async function ChartTestPage() {
  await requireDoctorWorkspaceContext();
  return <ChartTestPageClient />;
}
