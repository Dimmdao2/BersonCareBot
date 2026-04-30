INSERT INTO "patient_home_blocks" ("code", "title", "description", "is_visible", "sort_order")
VALUES ('useful_post', 'Полезный пост', 'Карточка выбранной CMS-страницы с обложкой', true, 11)
ON CONFLICT ("code") DO UPDATE
SET "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "sort_order" = EXCLUDED."sort_order",
    "updated_at" = now();
