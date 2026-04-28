-- Rollback (ops): DROP TABLE IF EXISTS patient_daily_mood CASCADE;

CREATE TABLE "patient_daily_mood" (
	"user_id" uuid NOT NULL,
	"mood_date" date NOT NULL,
	"score" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_daily_mood_user_id_mood_date_pk" PRIMARY KEY("user_id","mood_date"),
	CONSTRAINT "pdm_score_check" CHECK ((score >= 1) AND (score <= 5))
);
