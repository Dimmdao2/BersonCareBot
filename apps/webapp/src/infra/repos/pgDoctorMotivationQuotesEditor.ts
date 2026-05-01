import { asc } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type { DoctorMotivationQuotesEditorPort } from "@/modules/doctor-motivation-quotes/ports";
import { motivationalQuotes } from "../../../db/schema";

export function createPgDoctorMotivationQuotesEditorPort(): DoctorMotivationQuotesEditorPort {
  return {
    async listQuotesForEditor() {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(motivationalQuotes)
        .orderBy(asc(motivationalQuotes.sortOrder), asc(motivationalQuotes.createdAt));
      return rows.map((r) => ({
        id: r.id,
        body_text: r.bodyText,
        author: r.author,
        is_active: r.isActive,
        sort_order: r.sortOrder,
        archived_at: r.archivedAt ? new Date(r.archivedAt) : null,
      }));
    },
  };
}
