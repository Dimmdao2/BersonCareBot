import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { DevBypassPlatformUserPhonePort } from "@/modules/auth/devBypassPlatformUserPhonePort";

export async function applyDevBypassClientPhoneInDb(userId: string, phone: string): Promise<void> {
  await runWebappPgText(
    `UPDATE platform_users
     SET phone_normalized = $1,
         patient_phone_trust_at = COALESCE(patient_phone_trust_at, now()),
         updated_at = now()
     WHERE id = $2::uuid`,
    [phone, userId],
  );
}

export async function applyDevBypassStaffPhoneInDb(userId: string, phone: string): Promise<void> {
  await runWebappPgText(
    `UPDATE platform_users
     SET phone_normalized = $1,
         updated_at = now()
     WHERE id = $2::uuid`,
    [phone, userId],
  );
}

export const pgDevBypassPlatformUserPhonePort: DevBypassPlatformUserPhonePort = {
  applyClientPhone: applyDevBypassClientPhoneInDb,
  applyStaffPhone: applyDevBypassStaffPhoneInDb,
};
