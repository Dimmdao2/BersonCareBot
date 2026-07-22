-- B1c: the historical owner-email data-fix created this credential-less admin row.
-- Global admin for this email is now a fresh `admin_emails` session policy, never a persisted role.
--
-- This is intentionally narrower than "demote every admin with this email": only the
-- data-fix artifact has the exact owner fingerprint and no independent login/channel credential.
-- Email verification is intentionally NOT a predicate: OTP use verifies this same email,
-- but never changes its session-only admin provenance.
UPDATE public.platform_users AS platform_user
SET role = 'client',
    updated_at = now()
WHERE platform_user.role = 'admin'
  AND platform_user.display_name = 'Дмитрий Берсон'
  AND platform_user.email = 'dimmdao@gmail.com'
  AND platform_user.email_normalized = 'dimmdao@gmail.com'
  AND platform_user.phone_normalized IS NULL
  AND platform_user.integrator_user_id IS NULL
  AND platform_user.merged_into_id IS NULL
  AND platform_user.is_archived IS FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_channel_bindings AS binding
    WHERE binding.user_id = platform_user.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_oauth_bindings AS binding
    WHERE binding.user_id = platform_user.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_password_credentials AS credential
    WHERE credential.user_id = platform_user.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_pins AS pin
    WHERE pin.user_id = platform_user.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.login_tokens AS token
    WHERE token.user_id = platform_user.id
  );
