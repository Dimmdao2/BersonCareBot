import { NextResponse } from "next/server";
import { z } from "zod";

const uuidSchema = z.string().uuid();

/** 400 если `id` не UUID v4-совместимый (для params Next). */
export function jsonIfInvalidCatalogId(id: string): NextResponse | null {
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  return null;
}

/**
 * Маппинг ошибок PostgreSQL (node-pg) на HTTP для admin CRUD.
 * 23505 — unique_violation → 409; 23503 — foreign_key_violation → 400.
 */
export function httpFromDatabaseError(err: unknown): { status: number; error: string } | null {
  if (err !== null && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code);
    if (code === "23505") return { status: 409, error: "unique_violation" };
    if (code === "23503") return { status: 400, error: "foreign_key_violation" };
  }
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("duplicate key") || msg.includes("uq_booking")) {
    return { status: 409, error: "unique_violation" };
  }
  return null;
}
