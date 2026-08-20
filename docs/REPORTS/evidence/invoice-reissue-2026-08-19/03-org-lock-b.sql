BEGIN;
SELECT 'B: пытаюсь взять ' || clock_timestamp()::time(0) AS b;
SELECT pg_advisory_xact_lock(hashtextextended('clinic_invite_seats:a0000000-0000-4000-8000-000000000001', 0));
SELECT 'B: замок взят ' || clock_timestamp()::time(0) AS b;
COMMIT;
