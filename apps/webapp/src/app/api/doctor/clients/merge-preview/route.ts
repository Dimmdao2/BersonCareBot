/**
 * GET /api/doctor/clients/merge-preview?targetId=&duplicateId= — manual merge preview (no apply).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/infra/db/client";
import { buildMergePreview } from "@/infra/platformUserMergePreview";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const uuid = z.string().uuid();

function serializePreview(model: Awaited<ReturnType<typeof buildMergePreview>>) {
  if (!model.ok) {
    return model;
  }
  const row = (u: (typeof model)["target"]) => ({
    id: u.id,
    phoneNormalized: u.phone_normalized,
    integratorUserId: u.integrator_user_id,
    mergedIntoId: u.merged_into_id,
    displayName: u.display_name,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    emailVerifiedAt: u.email_verified_at?.toISOString() ?? null,
    role: u.role,
    createdAt: u.created_at.toISOString(),
    updatedAt: u.updated_at.toISOString(),
    isBlocked: u.is_blocked,
    isArchived: u.is_archived,
    blockedAt: u.blocked_at?.toISOString() ?? null,
    blockedReason: u.blocked_reason,
    blockedBy: u.blocked_by,
  });

  return {
    ok: true as const,
    targetId: model.targetId,
    duplicateId: model.duplicateId,
    target: row(model.target),
    duplicate: row(model.duplicate),
    targetBindings: model.targetBindings.map((b) => ({
      channelCode: b.channel_code,
      externalId: b.external_id,
      createdAt: b.created_at.toISOString(),
    })),
    duplicateBindings: model.duplicateBindings.map((b) => ({
      channelCode: b.channel_code,
      externalId: b.external_id,
      createdAt: b.created_at.toISOString(),
    })),
    targetOauth: model.targetOauth.map((o) => ({
      provider: o.provider,
      providerUserId: o.provider_user_id,
      email: o.email,
      createdAt: o.created_at.toISOString(),
    })),
    duplicateOauth: model.duplicateOauth.map((o) => ({
      provider: o.provider,
      providerUserId: o.provider_user_id,
      email: o.email,
      createdAt: o.created_at.toISOString(),
    })),
    dependentCounts: model.dependentCounts,
    hardBlockers: model.hardBlockers,
    scalarConflicts: model.scalarConflicts,
    channelConflicts: model.channelConflicts,
    oauthConflicts: model.oauthConflicts,
    autoMergeScalars: model.autoMergeScalars,
    recommendation: model.recommendation,
    mergeAllowed: model.mergeAllowed,
    v1MergeEngineCallable: model.v1MergeEngineCallable,
    platformUserMergeV2Enabled: model.platformUserMergeV2Enabled,
  };
}

export async function GET(request: Request) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const url = new URL(request.url);
  const targetIdRaw = url.searchParams.get("targetId");
  const duplicateIdRaw = url.searchParams.get("duplicateId");
  const parsed = z.object({ targetId: uuid, duplicateId: uuid }).safeParse({
    targetId: targetIdRaw ?? "",
    duplicateId: duplicateIdRaw ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const { targetId, duplicateId } = parsed.data;
  const model = await buildMergePreview(getPool(), targetId, duplicateId);
  if (!model.ok) {
    if (model.error === "same_id") {
      return NextResponse.json({ ok: false, error: "same_id", message: model.message }, { status: 400 });
    }
    if (model.error === "missing_user") {
      return NextResponse.json({ ok: false, error: "missing_user", message: model.message }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "not_client", message: model.message }, { status: 400 });
  }

  return NextResponse.json(serializePreview(model));
}
