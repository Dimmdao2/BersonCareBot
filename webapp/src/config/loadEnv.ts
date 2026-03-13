import { config } from "dotenv";

const envFile =
  typeof process.env.ENV_FILE === "string" && process.env.ENV_FILE.trim().length > 0
    ? process.env.ENV_FILE
    : null;

if (envFile) {
  config({ path: envFile });
} else {
  config();
}
