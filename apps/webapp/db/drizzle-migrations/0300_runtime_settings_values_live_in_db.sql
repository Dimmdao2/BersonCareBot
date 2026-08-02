-- Ч7 (владелец, 01.08): «я не просил хардкод в настройках — я всё прошу перенести в базу».
--
-- До этой миграции у каждой настройки было значение, зашитое в исходник (`*_DEFAULTS` в
-- `modules/system-settings/runtimeConfig.ts`), и оно подставлялось молча, когда чтение из базы не
-- удалось или строки не было. Замер 01.08 на dev показал, во что это выродилось: из 40 ключей
-- 19 захардкоженных значений НЕ совпадали с базой. То есть подстановка не «сохраняла текущее
-- поведение», а переводила систему в третье, ни с чем не связанное состояние: аллоулисты врача
-- становились пустыми, режим обслуживания снимался, включённые каналы входа выключались.
--
-- Значения ниже — это те самые константы из исходника, в последний раз. Дальше они живут только
-- здесь как НАЧАЛЬНОЕ значение для среды, где строки ещё нет, а распоряжается ими админка.
-- `ON CONFLICT DO NOTHING`: существующая строка всегда сильнее — миграция ничего не переписывает.
--
-- Organization overrides take precedence, but a global empty value is still an explicit DB answer.

INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json)
VALUES
  ('auth_email_enabled',                          'admin', NULL, 'public', '{"value": true}'),
  ('auth_sms_enabled',                            'admin', NULL, 'public', '{"value": false}'),
  ('auth_telegram_enabled',                       'admin', NULL, 'public', '{"value": true}'),
  ('auth_max_enabled',                            'admin', NULL, 'public', '{"value": true}'),
  ('auth_oauth_google_enabled',                   'admin', NULL, 'public', '{"value": true}'),
  ('auth_oauth_yandex_enabled',                   'admin', NULL, 'public', '{"value": true}'),
  ('auth_oauth_apple_enabled',                    'admin', NULL, 'public', '{"value": false}'),
  ('auth_passkey_enabled',                        'admin', NULL, 'public', '{"value": false}'),
  ('auth_pin_enabled',                            'admin', NULL, 'public', '{"value": false}'),
  ('oauth_yandex_enabled',                        'admin', NULL, 'public', '{"value": false}'),
  ('oauth_google_enabled',                        'admin', NULL, 'public', '{"value": false}'),
  ('oauth_apple_enabled',                         'admin', NULL, 'public', '{"value": false}'),
  ('public_sms_fallback_enabled',                 'admin', NULL, 'public', '{"value": false}'),
  ('specialist_signup_enabled',                   'admin', NULL, 'public', '{"value": false}'),
  ('patient_unsupported_client_fallback_enabled', 'admin', NULL, 'public', '{"value": false}'),
  ('telegram_login_bot_username',                 'admin', NULL, 'public', '{"value": ""}'),
  ('max_login_bot_nickname',                      'admin', NULL, 'public', '{"value": ""}'),
  ('vk_web_login_url',                            'admin', NULL, 'public', '{"value": ""}'),
  ('support_contact_url',                         'admin', NULL, 'public', '{"value": ""}'),
  ('app_display_timezone',                        'admin', NULL, 'public', '{"value": "Europe/Moscow"}'),
  ('patient_app_maintenance_enabled',             'admin', NULL, 'authenticated_client', '{"value": false}'),
  ('video_playback_api_enabled',                  'admin', NULL, 'authenticated_client', '{"value": false}'),
  ('patient_app_maintenance_message',             'admin', NULL, 'authenticated_client', '{"value": ""}'),
  ('patient_booking_url',                         'admin', NULL, 'authenticated_client', '{"value": ""}'),
  ('video_default_delivery',                      'admin', NULL, 'authenticated_client', '{"value": "auto"}'),
  ('patient_program_discussion_ui_enabled',       'admin', NULL, 'authenticated_client', '{"value": false}'),
  ('patient_program_discussion_media_submission_enabled', 'admin', NULL, 'authenticated_client', '{"value": false}'),
  ('patient_treatment_plan_item_done_repeat_cooldown_minutes', 'admin', NULL, 'authenticated_client', '{"value": 60}'),
  ('doctor_patient_support_comments_without_support_default_enabled', 'doctor', NULL, 'authenticated_client', '{"value": false}'),
  ('doctor_patient_support_media_without_support_default_enabled',    'doctor', NULL, 'authenticated_client', '{"value": false}'),
  ('debug_forward_to_admin',                      'admin', NULL, 'server', '{"value": false}'),
  ('auth_2fa_enabled',                            'admin', NULL, 'server', '{"value": false}'),
  ('admin_telegram_ids',                          'admin', NULL, 'server', '{"value": []}'),
  ('admin_max_ids',                               'admin', NULL, 'server', '{"value": []}'),
  ('admin_phones',                                'admin', NULL, 'server', '{"value": []}'),
  ('admin_emails',                                'admin', NULL, 'server', '{"value": []}'),
  ('doctor_telegram_ids',                         'admin', NULL, 'server', '{"value": []}'),
  ('doctor_max_ids',                              'admin', NULL, 'server', '{"value": []}'),
  ('doctor_phones',                               'admin', NULL, 'server', '{"value": []}'),
  ('doctor_today_preferences',                    'doctor', NULL, 'server', '{"value":{"visibleProactiveInsightKinds":["wellbeing_low_streak","program_inactivity"],"peopleListMode":"on_support"}}'),
  ('video_presign_ttl_seconds',                   'admin', NULL, 'server', '{"value": 3600}')
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
