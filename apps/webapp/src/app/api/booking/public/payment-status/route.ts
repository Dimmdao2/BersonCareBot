import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId")?.trim();
  const phone = url.searchParams.get("phone")?.trim();
  if (!bookingId || !phone) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const result = await deps.patientBooking.getBookingPaymentStatusForContact(bookingId, phone);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "forbidden" ? 403 : 404 });
  }
  return NextResponse.json({
    ok: true,
    booking: result.booking,
    summary: result.summary,
    intentId: result.intentId,
  });
}
