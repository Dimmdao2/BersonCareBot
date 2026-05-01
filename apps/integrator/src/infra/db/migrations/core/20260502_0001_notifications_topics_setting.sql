-- Mirror webapp system_settings key notifications_topics (patient /notifications topic labels).
INSERT INTO system_settings (key, scope, value_json)
VALUES (
  'notifications_topics',
  'admin',
  '{"value":[{"id":"exercise_reminders","title":"Напоминания об упражнениях"},{"id":"symptom_reminders","title":"Напоминания о симптомах"},{"id":"appointment_reminders","title":"Напоминания о записях"},{"id":"news","title":"Новости и обновления"}]}'::jsonb
)
ON CONFLICT (key, scope) DO NOTHING;
