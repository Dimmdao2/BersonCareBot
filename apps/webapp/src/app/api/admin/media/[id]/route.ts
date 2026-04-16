import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { pgFolderExists } from "@/infra/repos/mediaFoldersRepo";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const querySchema = z.object({
  confirmDelete: z.enum(["true", "false"]).optional(),
  confirmUsed: z.enum(["true", "false"]).optional(),
});

const patchBodySchema = z
  .object({
    displayName: z.union([z.string().max(180), z.null()]).optional(),
    folderId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .refine((d) => d.displayName !== undefined || d.folderId !== undefined, {
    message: "no_fields",
  });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const row = await deps.media.getById(id);
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const item = {
    ...row,
    url: row.url ?? `/api/media/${row.id}`,
  };

  return NextResponse.json({ ok: true, item });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    confirmDelete: url.searchParams.get("confirmDelete") ?? undefined,
    confirmUsed: url.searchParams.get("confirmUsed") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }
  const confirmDelete = parsed.data.confirmDelete === "true";
  const confirmUsed = parsed.data.confirmUsed === "true";
  if (!confirmDelete) {
    return NextResponse.json({ ok: false, error: "confirm_required" }, { status: 409 });
  }

  const deps = buildAppDeps();
  const usage = await deps.media.findUsage(id);
  if (usage.length > 0 && !confirmUsed) {
    return NextResponse.json({ ok: false, error: "media_in_use", usage }, { status: 409 });
  }

  const deleted = await deps.media.deleteHard(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    deleted: true,
    scheduled: true,
    usage,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsedBody = patchBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();

  if (parsedBody.data.folderId !== undefined) {
    if (parsedBody.data.folderId !== null) {
      const exists = await pgFolderExists(parsedBody.data.folderId);
      if (!exists) {
        return NextResponse.json({ ok: false, error: "folder_not_found" }, { status: 404 });
      }
    }
    const moved = await deps.media.updateMediaFolder(id, parsedBody.data.folderId);
    if (!moved) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }

  let displayNameOut: string | null | undefined;
  if (parsedBody.data.displayName !== undefined) {
    const normalized =
      typeof parsedBody.data.displayName === "string"
        ? parsedBody.data.displayName.trim() || null
        : null;
    const updated = await deps.media.updateDisplayName(id, normalized);
    if (!updated) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    displayNameOut = normalized;
  }

  return NextResponse.json({
    ok: true,
    id,
    ...(displayNameOut !== undefined ? { displayName: displayNameOut } : {}),
    ...(parsedBody.data.folderId !== undefined ? { folderId: parsedBody.data.folderId } : {}),
  });
}
