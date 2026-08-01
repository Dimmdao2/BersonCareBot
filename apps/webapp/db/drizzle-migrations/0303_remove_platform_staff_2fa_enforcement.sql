DELETE FROM public.app_runtime_settings
WHERE key = 'auth_2fa_enabled';

DELETE FROM public.system_settings
WHERE key = 'auth_2fa_enabled';
