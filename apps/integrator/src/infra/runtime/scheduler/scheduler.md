Resident scheduler owns only leader election and fixed-cadence signed wakes.

- hourly wake → webapp operator-health digest use-case;
- 15-minute wake → webapp system-health guard use-case;
- product due-time, timezone, recipients, channels and copy remain webapp decisions;
- legacy host cron remains active during the observation period; stable queue event IDs make overlap safe.
