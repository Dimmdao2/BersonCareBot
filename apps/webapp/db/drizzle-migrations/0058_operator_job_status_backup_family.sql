-- Align legacy backup job rows with MVP contract (job_family=backup, job_key backup.*).
UPDATE public.operator_job_status
SET
	job_family = 'backup',
	job_key = CASE job_key
		WHEN 'hourly' THEN 'backup.hourly'
		WHEN 'daily' THEN 'backup.daily'
		WHEN 'weekly' THEN 'backup.weekly'
		WHEN 'manual' THEN 'backup.manual'
		WHEN 'prune' THEN 'backup.prune'
		WHEN 'pre-migrations' THEN 'backup.pre_migrations'
		ELSE job_key
	END
WHERE job_family = 'postgres_backup'
	OR job_key IN ('hourly', 'daily', 'weekly', 'manual', 'prune', 'pre-migrations');
