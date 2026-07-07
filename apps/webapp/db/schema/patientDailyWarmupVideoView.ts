import { foreignKey, index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { contentPages, platformUsers } from "./schema";
import { beOrganizations } from "./bookingEngine";

/** Журнал открытий видео разминки дня (`POST /api/patient/daily-warmup/video-viewed`). */
export const patientDailyWarmupVideoViews = pgTable(
  "patient_daily_warmup_video_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"),
    userId: uuid("user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
    contentPageId: uuid("content_page_id")
      .notNull()
      .references(() => contentPages.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_patient_daily_warmup_video_views_organization_id").on(table.organizationId),
    index("idx_patient_daily_warmup_video_views_viewed_at").on(table.viewedAt),
    index("idx_patient_daily_warmup_video_views_page_viewed").on(table.contentPageId, table.viewedAt),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "patient_daily_warmup_video_views_organization_id_fkey",
    }).onDelete("cascade"),
  ],
);
