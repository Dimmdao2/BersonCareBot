/**
 * Общая реализация смены архива для клиента (`platform_users.role = 'client'`).
 * Используется и кабинетом врача (`/api/doctor/clients/.../archive`), и админским API (`/api/admin/users/.../archive`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/infra/db/client";
import { createPgDoctorClientsPort } from "@/infra/repos/pgDoctorClients";

const doctorClientsPort = createPgDoctorClientsPort();

export const clientArchiveBodySchema = z.object({
  archived: z.boolean(),
});

/**
 * @param userId — уже проверенный UUID
 */
export async function applyClientArchiveChange(
  userId: string,
  archived: boolean,
): Promise<NextResponse> {
  // Дешёвый SELECT роли до getClientIdentity (JOIN привязок) — быстрый 404 для не-клиентов.
  const roleRow = await getPool().query<{ role: string }>(
    `SELECT role FROM platform_users WHERE id = $1::uuid`,
    [userId],
  );
  if (!roleRow.rows[0]) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (roleRow.rows[0].role !== "client") {
    return NextResponse.json({ ok: false, error: "not_client" }, { status: 404 });
  }

  const identity = await doctorClientsPort.getClientIdentity(userId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await doctorClientsPort.setUserArchived(userId, archived);
  return NextResponse.json({ ok: true });
}
