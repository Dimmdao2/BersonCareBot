import dotenv from 'dotenv';

const envFile = typeof process.env.ENV_FILE === 'string' && process.env.ENV_FILE.trim().length > 0
  ? process.env.ENV_FILE
  : null;

// Do not override vars already set (e.g. by systemd EnvironmentFile).
if (envFile) {
  dotenv.config({ path: envFile, override: false });
} else {
  dotenv.config({ override: false });
}
