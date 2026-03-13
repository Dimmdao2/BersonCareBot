import { NextResponse } from "next/server";
import { validateReminderDispatchPayload } from "@/modules/reminders/service";
import { verifyIntegratorSignature } from "@/infra/webhooks/verifyIntegratorSignature";

export async function POST(request: Request) {
  const timestamp = request.headers.get("x-bersoncare-timestamp");
  const signature = request.headers.get("x-bersoncare-signature");
  const rawBody = await request.text();

  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "missing webhook headers" }, { status: 400 });
  }

  if (!verifyIntegratorSignature(timestamp, rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as unknown;
  if (!validateReminderDispatchPayload(payload)) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    accepted: true,
    dispatchMode: "bridge-to-integrator",
  });
}
