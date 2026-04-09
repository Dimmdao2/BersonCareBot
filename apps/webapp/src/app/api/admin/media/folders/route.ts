import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { pgFolderExists } from "@/infra/repos/mediaFoldersRepo";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const postBodySchema = z.object({
  name: z.string().min(1).max(180),
  parentId: z.union([z.string().uuid(), z.null()]).optional(),
});

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("flat") === "true") {
    const deps = buildAppDeps();
    const items = await deps.media.listAllFolders();
    return NextResponse.json({ ok: true, items });
  }

  const rawParent = url.searchParams.get("parentId");
  let parentId: string | null = null;
  if (rawParent === null || rawParent === "" || rawParent === "root") {
    parentId = null;
  } else if (UUID_RE.test(rawParent)) {
    parentId = rawParent;
  } else {
    return NextResponse.json({ ok: false, error: "invalid_parent_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const items = await deps.media.listFolders(parentId);
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const parentId = parsed.data.parentId === undefined ? null : parsed.data.parentId;
  if (parentId !== null) {
    const exists = await pgFolderExists(parentId);
    if (!exists) {
      return NextResponse.json({ ok: false, error: "parent_not_found" }, { status: 404 });
    }
  }

  const deps = buildAppDeps();
  try {
    const folder = await deps.media.createFolder({
      name: parsed.data.name,
      parentId,
      createdBy: session.user.userId,
    });
    return NextResponse.json({ ok: true, folder });
  } catch {
    return NextResponse.json({ ok: false, error: "create_failed" }, { status: 409 });
  }
}
