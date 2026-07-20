import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { PlatformLfkLibraryPort } from "@/modules/platform-lfk-library/ports";
import type {
  PlatformLfkExercise,
  PlatformLfkMediaInput,
  PlatformLfkSnapshot,
  PlatformLfkTemplate,
} from "@/modules/platform-lfk-library/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function parseSnapshot(value: unknown): PlatformLfkSnapshot {
  const record = asRecord(value);
  const rawExercises = Array.isArray(record?.exercises) ? record.exercises : [];
  const rawTemplates = Array.isArray(record?.templates) ? record.templates : [];
  const exercises: PlatformLfkExercise[] = rawExercises.flatMap((value) => {
    const row = asRecord(value);
    if (!row || typeof row.id !== "string" || typeof row.title !== "string") return [];
    const media: PlatformLfkMediaInput[] = Array.isArray(row.media)
      ? row.media.flatMap((mediaValue) => {
          const mediaRow = asRecord(mediaValue);
          if (
            !mediaRow ||
            typeof mediaRow.url !== "string" ||
            (mediaRow.type !== "image" && mediaRow.type !== "video" && mediaRow.type !== "gif")
          ) return [];
          const mediaType: PlatformLfkMediaInput["media_type"] = mediaRow.type;
          return [{
            url: mediaRow.url,
            media_type: mediaType,
            sort_order: typeof mediaRow.sortOrder === "number" ? mediaRow.sortOrder : 0,
          }];
        })
      : [];
    return [{
      id: row.id,
      title: row.title,
      description: typeof row.description === "string" ? row.description : null,
      isArchived: row.isArchived === true,
      media,
    }];
  });
  const templates: PlatformLfkTemplate[] = rawTemplates.flatMap((value) => {
    const row = asRecord(value);
    if (!row || typeof row.id !== "string" || typeof row.title !== "string") return [];
    return [{
      id: row.id,
      title: row.title,
      description: typeof row.description === "string" ? row.description : null,
      status: row.status === "archived" ? "archived" : "published",
      exerciseIds: Array.isArray(row.exerciseIds)
        ? row.exerciseIds.filter((id): id is string => typeof id === "string")
        : [],
    }];
  });
  return { exercises, templates };
}

export function createPgPlatformLfkLibraryPort(): PlatformLfkLibraryPort {
  return {
    async getSnapshot() {
      const result = await runWebappPgText<{ value: unknown }>(
        "SELECT app.c4d_platform_lfk_snapshot() AS value",
      );
      return parseSnapshot(result.rows[0]?.value);
    },
    async saveExercise(actorId, input) {
      const result = await runWebappPgText<{ id: string }>(
        "SELECT app.c4d_platform_lfk_save_exercise($1::uuid, $2::jsonb)::text AS id",
        [actorId, JSON.stringify(input)],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("platform_lfk_exercise_save_failed");
      return id;
    },
    async setExerciseArchived(actorId, id, archived) {
      const result = await runWebappPgText<{ ok: boolean }>(
        "SELECT app.c4d_platform_lfk_archive_exercise($1::uuid, $2::uuid, $3::boolean) AS ok",
        [actorId, id, archived],
      );
      return result.rows[0]?.ok === true;
    },
    async saveTemplate(actorId, input) {
      const result = await runWebappPgText<{ id: string }>(
        "SELECT app.c4d_platform_lfk_save_template($1::uuid, $2::jsonb)::text AS id",
        [actorId, JSON.stringify(input)],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error("platform_lfk_template_save_failed");
      return id;
    },
    async setTemplateArchived(actorId, id, archived) {
      const result = await runWebappPgText<{ ok: boolean }>(
        "SELECT app.c4d_platform_lfk_archive_template($1::uuid, $2::uuid, $3::boolean) AS ok",
        [actorId, id, archived],
      );
      return result.rows[0]?.ok === true;
    },
  };
}
