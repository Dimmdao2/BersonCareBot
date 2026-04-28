CREATE TABLE "patient_home_blocks" (
	"code" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_home_block_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_code" text NOT NULL,
	"target_type" text NOT NULL,
	"target_ref" text NOT NULL,
	"title_override" text,
	"subtitle_override" text,
	"image_url_override" text,
	"badge_label" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_home_block_items_target_type_check" CHECK (target_type = ANY (ARRAY['content_page'::text, 'content_section'::text, 'course'::text, 'static_action'::text]))
);
--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "cover_image_url" text;--> statement-breakpoint
ALTER TABLE "content_sections" ADD COLUMN "icon_image_url" text;--> statement-breakpoint
ALTER TABLE "patient_home_block_items" ADD CONSTRAINT "patient_home_block_items_block_fkey" FOREIGN KEY ("block_code") REFERENCES "public"."patient_home_blocks"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_patient_home_block_items_block_sort" ON "patient_home_block_items" USING btree ("block_code" text_ops,"sort_order" int4_ops);--> statement-breakpoint
INSERT INTO "patient_home_blocks" ("code", "title", "description", "is_visible", "sort_order")
VALUES
	('daily_warmup', 'Разминка дня', 'Главная hero-карточка с материалом дня', true, 10),
	('booking', 'Запись на приём', 'Карточка записи и моих приёмов', true, 20),
	('situations', 'Ситуации', 'Горизонтальный ряд иконок ситуаций', true, 30),
	('progress', 'Прогресс', 'Сегодня выполнено и серия дней', true, 40),
	('next_reminder', 'Следующее напоминание', 'Ближайшая практика по расписанию', true, 50),
	('mood_checkin', 'Самочувствие', 'Оценка состояния 1–5', true, 60),
	('sos', 'Если болит сейчас', 'Быстрый переход к SOS-материалам', true, 70),
	('plan', 'Мой план', 'Активный курс/программа пациента', true, 80),
	('subscription_carousel', 'Материалы по подписке', 'Карусель подписочных материалов', true, 90),
	('courses', 'Курсы', 'Большие курсы', true, 100)
ON CONFLICT ("code") DO NOTHING;