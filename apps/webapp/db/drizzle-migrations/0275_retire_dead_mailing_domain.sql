-- Track D8: retire the mailing/subscription source, projection and legacy-shadow tables.
-- The exact producer/consumer census found no live producer for the three projection events.

DO $$
DECLARE
  v_name text;
  v_table regclass;
  v_count bigint;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.mailing_logs_webapp',
    'public.user_subscriptions_webapp',
    'public.mailing_topics_webapp',
    'public.mailing_logs',
    'public.user_subscriptions',
    'public.mailings',
    'public.mailing_topics',
    'integrator.mailing_logs',
    'integrator.user_subscriptions',
    'integrator.mailings',
    'integrator.mailing_topics'
  ]
  LOOP
    v_table := to_regclass(v_name);
    IF v_table IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', v_table) INTO v_count;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'D8 refuses to drop non-empty table % (% rows)', v_name, v_count;
      END IF;
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint

DROP TABLE IF EXISTS public.mailing_logs_webapp;
--> statement-breakpoint
DROP TABLE IF EXISTS public.user_subscriptions_webapp;
--> statement-breakpoint
DROP TABLE IF EXISTS public.mailing_topics_webapp;
--> statement-breakpoint

DROP TABLE IF EXISTS public.mailing_logs;
--> statement-breakpoint
DROP TABLE IF EXISTS public.user_subscriptions;
--> statement-breakpoint
DROP TABLE IF EXISTS public.mailings;
--> statement-breakpoint
DROP TABLE IF EXISTS public.mailing_topics;
--> statement-breakpoint

DROP TABLE IF EXISTS integrator.mailing_logs;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.user_subscriptions;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.mailings;
--> statement-breakpoint
DROP TABLE IF EXISTS integrator.mailing_topics;
--> statement-breakpoint

DROP FUNCTION IF EXISTS integrator.stage13_prevent_write_user_subscriptions();
--> statement-breakpoint
DROP FUNCTION IF EXISTS integrator.stage13_prevent_write_mailing_topics();
