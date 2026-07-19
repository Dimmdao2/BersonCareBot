/**
 * POST /api/doctor/clients — создать пациента (телефон обязателен; email → ссылка на вход).
 */
import { NextResponse } from "next/server";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  // A platform-user create is not an organization enrollment. U3B owns the
  // explicit manual-patient relationship workflow, so this legacy endpoint
  // must not manufacture an ambiguous global patient before that contract.
  return NextResponse.json(
    { ok: false, error: "manual_patient_creation_not_available" },
    { status: 409 },
  );

}
