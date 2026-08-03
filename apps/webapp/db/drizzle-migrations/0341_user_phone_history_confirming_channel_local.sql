-- 0341: F1 (Track D / #987 D27) — user_phone_history recorded WHICH source confirmed a phone
-- (otp/messenger/merge/admin/projection) but never WHICH channel, so getDefaultAuthOtpChannel
-- could only approximate IDENTITY_AND_MERGE_SCHEME.md §3.1 ("бот, которым впервые подтвердили
-- номер") as "earliest-linked Telegram/Max binding or verified email". That approximation is wrong
-- whenever a channel was linked before it actually confirmed the phone (e.g. Telegram linked in
-- 2024 without a phone, the phone later confirmed via Max in 2026 — the old query picked Telegram).
--
-- Nullable by design: only 'otp'/'messenger' writers set it going forward (see
-- pgPhoneHistory.applyPlatformUserPhoneHistoryTransition); 'merge'/'admin'/'projection' rows and
-- every row written before this migration stay NULL and fall back to the previous earliest-linked
-- heuristic in pgChannelPreferences.getDefaultAuthOtpChannel — no provenance is invented for them.
ALTER TABLE public.user_phone_history
  ADD COLUMN IF NOT EXISTS confirming_channel text;

ALTER TABLE public.user_phone_history
  ADD CONSTRAINT user_phone_history_confirming_channel_check
  CHECK (confirming_channel IS NULL OR confirming_channel = ANY (ARRAY['telegram'::text, 'max'::text, 'email'::text, 'sms'::text]));
