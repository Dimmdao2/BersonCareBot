Resident scheduler owns only leader election and fixed-cadence signed wakes.

Every synchronous cadence failure is logged with a value-free `cadenceStep` identifier
(`operator_health_digest_wake`, `system_health_guard_wake`, or `operator_health_probe`). Raw error
messages remain behind the shared safe serializer, but an operator can identify the failed body
without guessing from a generic loop error.

- hourly wake → webapp operator-health digest use-case;
- 15-minute wake → webapp system-health guard use-case;
- product due-time, timezone, recipients, channels and copy remain webapp decisions;
- legacy host cron remains active during the observation period; stable queue event IDs make overlap safe.
