import { config } from "dotenv";
import path from "node:path";

const envFile =
  typeof process.env.ENV_FILE === "string" && process.env.ENV_FILE.trim().length > 0
    ? process.env.ENV_FILE
    : null;

if (envFile) {
  config({ path: path.resolve(process.cwd(), envFile) });
} else if (process.env.NODE_ENV === "development") {
  // В dev по умолчанию грузим .env.dev (чтобы не требовать копию .env). Затем .env переопределяет при наличии.
  config({ path: path.resolve(process.cwd(), ".env.dev") });
  config();
} else {
  config();
}
