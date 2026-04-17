import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { pgFolderExists } from "@/app-layer/media/mediaFoldersRepo";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchBodySchema = z
  .object({
    name: z.string().min(1).max(180).optional(),
    parentId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .refine((d) => d.name !== undefined || d.parentId !== undefined, { message: "no_fields" });

export async function PATCH(
  request: Request,
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

  const raw = await request.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();

  if (parsed.data.parentId !== undefined) {
    if (parsed.data.parentId !== null) {
      if (parsed.data.parentId === id) {
        return NextResponse.json({ ok: false, error: "invalid_parent" }, { status: 400 });
      }
      const exists = await pgFolderExists(parsed.data.parentId);
      if (!exists) {
        return NextResponse.json({ ok: false, error: "parent_not_found" }, { status: 404 });
      }
    }
    try {
      const ok = await deps.media.moveFolder(id, parsed.data.parentId);
      if (!ok) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: "move_failed" }, { status: 409 });
    }
  }

  if (parsed.data.name !== undefined) {
    const ok = await deps.media.renameFolder(id, parsed.data.name);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(
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
  const result = await deps.media.deleteFolder(id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }
  return NextResponse.json({ ok: true, deleted: true });
}
