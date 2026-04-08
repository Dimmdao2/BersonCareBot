import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";

/**
 * Для опасных операций: только `role === admin` и включённый `adminMode` в сессии.
 */
export async function requireAdminModeSession(): Promise<
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>> }
  | { ok: false; response: NextResponse }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin" || !session.adminMode) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, session };
}
