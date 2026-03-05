import dotenv from 'dotenv';

const envFile = typeof process.env.ENV_FILE === 'string' && process.env.ENV_FILE.trim().length > 0
  ? process.env.ENV_FILE
  : null;

if (envFile) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
}
