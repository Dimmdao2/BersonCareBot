INSERT INTO "patient_home_blocks" ("code", "title", "description", "is_visible", "sort_order")
VALUES ('useful_post', 'Полезный пост', 'Карточка выбранной CMS-страницы с обложкой', true, 15)
ON CONFLICT ("code") DO UPDATE
SET "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "updated_at" = now();
