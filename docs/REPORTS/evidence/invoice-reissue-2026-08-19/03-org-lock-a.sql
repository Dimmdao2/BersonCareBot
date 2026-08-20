\timing off
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('clinic_invite_seats:a0000000-0000-4000-8000-000000000001', 0));
SELECT 'A: замок взят ' || clock_timestamp()::time(0) AS a;
SELECT pg_sleep(3);
SELECT 'A: отпускаю ' || clock_timestamp()::time(0) AS a;
COMMIT;
