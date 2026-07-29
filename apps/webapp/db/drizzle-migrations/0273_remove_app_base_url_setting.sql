-- Deployment identity is environment configuration, not an administrator-editable setting.
-- Delete global and organization-scoped remnants; no other setting keys are affected.
DELETE FROM public.system_settings
WHERE key = 'app_base_url';
