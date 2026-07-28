/**
 * Общая реализация смены архива для клиента (`platform_users.role = 'client'`).
 * Используется и кабинетом врача (`/api/doctor/clients/.../archive`), и админским API (`/api/admin/users/.../archive`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

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
  // `platform_users.is_archived` is global while a patient can have more than
  // one organization enrollment. There is no sanctioned per-enrollment archive
  // port yet, therefore a compatibility route cannot safely mutate it.
  return NextResponse.json({ ok: false, error: 'patient_archive_not_available' }, { status: 409 });
}
