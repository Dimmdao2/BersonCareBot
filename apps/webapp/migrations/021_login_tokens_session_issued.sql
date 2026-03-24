-- Однократная выдача сессии при poll после подтверждения login-токена (защита от повторных set-cookie).
ALTER TABLE login_tokens ADD COLUMN IF NOT EXISTS session_issued_at TIMESTAMPTZ;
