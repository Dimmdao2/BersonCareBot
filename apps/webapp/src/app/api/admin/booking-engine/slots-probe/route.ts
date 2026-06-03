import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseBookingSlotsReadSource } from "@/modules/patient-booking/slotsReadSource";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

const QuerySchema = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function formatSlotTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    branchId: url.searchParams.get("branchId"),
    serviceId: url.searchParams.get("serviceId"),
    date: url.searchParams.get("date"),
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.bookingScheduling || !deps.patientBooking) {
    return NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 503 });
  }

  const { organizationId, service } = gate.ctx;
  const [branch, specialists, slotsReadSourceRow] = await Promise.all([
    service.catalog.getBranch(parsed.data.branchId),
    service.catalog.listSpecialists(organizationId),
    deps.systemSettings?.getSetting("booking_slots_read_source", "admin"),
  ]);
  if (!branch || branch.organizationId !== organizationId) {
    return NextResponse.json({ ok: false, error: "branch_not_found" }, { status: 404 });
  }

  const defaultSpecialist = specialists.find((s) => s.isActive) ?? specialists[0] ?? null;
  const branchServiceId = await deps.bookingScheduling.resolveLegacyBranchServiceId({
    organizationId,
    branchId: parsed.data.branchId,
    serviceId: parsed.data.serviceId,
    specialistId: defaultSpecialist?.id ?? null,
  });
  if (!branchServiceId) {
    return NextResponse.json({ ok: false, error: "branch_service_mapping_missing" }, { status: 404 });
  }

  const bookingSlotsReadSource = parseBookingSlotsReadSource(slotsReadSourceRow?.valueJson ?? null);

  try {
    const byDate = await deps.patientBooking.getSlots({
      type: "in_person",
      branchServiceId,
      date: parsed.data.date,
      slotCount: 1,
    });
    const day = byDate.find((row) => row.date === parsed.data.date) ?? byDate[0];
    const slots = (day?.slots ?? []).map((slot) => formatSlotTime(slot.startAt, branch.timezone));

    return NextResponse.json({
      ok: true,
      date: parsed.data.date,
      bookingSlotsReadSource,
      slots,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
