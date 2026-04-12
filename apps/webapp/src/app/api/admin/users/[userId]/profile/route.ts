/**
 * PATCH /api/admin/users/:userId/profile — правка ФИО, email и телефона канонического клиента.
 * Guard: admin + admin mode.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getPool } from "@/infra/db/client";
import { writeAuditLog } from "@/infra/adminAuditLog";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

const bodySchema = z
  .object({
    displayName: z.string().max(500).optional(),
    firstName: z.union([z.string().max(200), z.null()]).optional(),
    lastName: z.union([z.string().max(200), z.null()]).optional(),
    email: z.union([z.string().email().max(320), z.literal(""), z.null()]).optional(),
    phone: z.union([z.string().max(40), z.null()]).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "empty_patch" });

type AdminClientProfilePatch = {
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNormalized?: string | null;
};

function normalizePatch(data: z.infer<typeof bodySchema>): AdminClientProfilePatch {
  const out: AdminClientProfilePatch = {};
  if (data.displayName !== undefined) out.displayName = data.displayName;
  if (data.firstName !== undefined) out.firstName = data.firstName;
  if (data.lastName !== undefined) out.lastName = data.lastName;
  if (data.email !== undefined) {
    out.email = data.email === "" || data.email === null ? null : data.email;
  }
  return out;
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const empty = parsed.error.issues.some((i) => i.message === "empty_patch");
    return NextResponse.json(
      { ok: false, error: empty ? "empty_patch" : "invalid_body" },
      { status: 400 },
    );
  }

  const patch = normalizePatch(parsed.data);
  if (parsed.data.phone !== undefined) {
    if (parsed.data.phone === null || String(parsed.data.phone).trim() === "") {
      patch.phoneNormalized = null;
    } else {
      const n = normalizeRuPhoneE164(String(parsed.data.phone).trim());
      if (!/^\+7\d{10}$/.test(n)) {
        return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
      }
      patch.phoneNormalized = n;
    }
  }

  const pool = getPool();
  const canonicalId = (await resolveCanonicalUserId(pool, userId)) ?? userId;

  if (patch.email !== undefined && patch.email !== null && patch.email.trim() !== "") {
    const conflict = await pool.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE id <> $1::uuid
         AND merged_into_id IS NULL
         AND email IS NOT NULL
         AND lower(trim(email)) = lower(trim($2::text))
       LIMIT 1`,
      [canonicalId, patch.email.trim()],
    );
    if (conflict.rows.length > 0) {
      return NextResponse.json({ ok: false, error: "email_conflict" }, { status: 409 });
    }
  }

  if (patch.phoneNormalized !== undefined && patch.phoneNormalized !== null) {
    const conflict = await pool.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE id <> $1::uuid
         AND merged_into_id IS NULL
         AND phone_normalized IS NOT NULL
         AND phone_normalized = $2
       LIMIT 1`,
      [canonicalId, patch.phoneNormalized],
    );
    if (conflict.rows.length > 0) {
      return NextResponse.json({ ok: false, error: "phone_conflict" }, { status: 409 });
    }
  }

  const deps = buildAppDeps();
  const result = await deps.userProjection.patchAdminClientProfile({
    platformUserId: canonicalId,
    patch,
  });

  if (!result.ok) {
    if (result.reason === "nothing_to_update") {
      return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const fieldsChanged = Object.keys(patch);
  await writeAuditLog(pool, {
    actorId: adminGate.session.user.userId,
    action: "admin_client_profile_patch",
    targetId: canonicalId,
    details: {
      fields: fieldsChanged,
      emailTouched: patch.email !== undefined,
      phoneTouched: patch.phoneNormalized !== undefined,
    },
    status: "ok",
  });

  return NextResponse.json({ ok: true, userId: canonicalId });
}
