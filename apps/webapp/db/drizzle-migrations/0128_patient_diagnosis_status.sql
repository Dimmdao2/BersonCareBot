-- Диагноз: клинический статус жизненного цикла (предварительный/подтверждённый/закрытый)
-- + история изменений этого статуса.
--
-- КОНТЕКСТ: clinical_diagnosis уже имеет поле status ('active'/'refined'/'resolved'),
-- которое управляется через визиты (уточнение / снятие). Новое поле clinical_status —
-- независимый «клинический» статус, выставляемый врачом напрямую:
--   предварительный (по умолчанию) → подтверждённый → закрытый.
-- Аудит-лог хранится в clinical_diagnosis_status_history.

-- +migrate Up

ALTER TABLE "clinical_diagnosis"
  ADD COLUMN "clinical_status" text NOT NULL DEFAULT 'предварительный',
  ADD CONSTRAINT "clinical_diagnosis_clinical_status_check"
    CHECK (
      clinical_status = ANY (ARRAY[
        'предварительный'::text,
        'подтверждённый'::text,
        'закрытый'::text
      ])
    );
--> statement-breakpoint

CREATE TABLE "clinical_diagnosis_status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "diagnosis_id" uuid NOT NULL,
  "old_status" text,
  "new_status" text NOT NULL,
  "changed_by" uuid,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "note" text,
  CONSTRAINT "clinical_diagnosis_status_history_new_status_check"
    CHECK (
      new_status = ANY (ARRAY[
        'предварительный'::text,
        'подтверждённый'::text,
        'закрытый'::text
      ])
    ),
  CONSTRAINT "clinical_diagnosis_status_history_diagnosis_id_fkey"
    FOREIGN KEY ("diagnosis_id")
    REFERENCES "clinical_diagnosis"("id") ON DELETE CASCADE,
  CONSTRAINT "clinical_diagnosis_status_history_changed_by_fkey"
    FOREIGN KEY ("changed_by")
    REFERENCES "platform_users"("id") ON DELETE SET NULL
);
--> statement-breakpoint

CREATE INDEX "idx_clinical_diagnosis_status_history_diagnosis_id"
  ON "clinical_diagnosis_status_history" ("diagnosis_id");
--> statement-breakpoint

-- +migrate Down (run these manually to revert)
-- DROP TABLE IF EXISTS "clinical_diagnosis_status_history";
-- ALTER TABLE "clinical_diagnosis" DROP CONSTRAINT IF EXISTS "clinical_diagnosis_clinical_status_check";
-- ALTER TABLE "clinical_diagnosis" DROP COLUMN IF EXISTS "clinical_status";
