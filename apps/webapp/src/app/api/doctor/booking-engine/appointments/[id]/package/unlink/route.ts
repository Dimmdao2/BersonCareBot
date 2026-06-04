import { runPackageDetach } from "@/app/api/booking-engine/packageDetachShared";
import { requireDoctorBookingEngine } from "../../../../_requireDoctorBookingEngine";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { confirmPastTwice?: boolean };
  return runPackageDetach({
    organizationId: gate.ctx.organizationId,
    appointmentId,
    createdByPlatformUserId: gate.ctx.session.user.userId,
    outcome: "release_reserve",
    confirmPastTwice: body.confirmPastTwice,
  });
}
