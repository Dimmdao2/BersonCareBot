/**
 * Loads /run/bersoncarebot/saas-smoke.fixture (root:deploy, 0640) via `sudo -n cat` — the same
 * operator fixture the G4 app walk read, unmodified. Never logs the parsed cookie values; only
 * ok/fail status lines. See docs/_TODO/SAAS_FOUNDATION/scripts/regenerate-saas-smoke-fixture.mjs
 * for how the fixture itself is produced/rotated (out of scope here — this file only reads it).
 */
import { execFileSync } from "node:child_process";

const FIXTURE_PATH = "/run/bersoncarebot/saas-smoke.fixture";
const SESSION_COOKIE_NAME = "bersoncare_webapp_session";

let cached = null;

export function loadFixture() {
  if (cached) return cached;
  const raw = execFileSync("sudo", ["-n", "cat", FIXTURE_PATH], { encoding: "utf8" });
  cached = JSON.parse(raw);
  return cached;
}

/** Returns { name, value } for the session cookie of the given profile. Never logs the value. */
export function cookieFor(profile) {
  const fixture = loadFixture();
  const prof = fixture.authProfiles?.[profile];
  if (!prof) throw new Error(`fixture has no authProfiles.${profile}`);
  const cookieHeader = prof.headers?.Cookie;
  if (!cookieHeader) throw new Error(`fixture authProfiles.${profile} has no Cookie header`);
  const match = cookieHeader.match(new RegExp(`^${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) throw new Error(`fixture authProfiles.${profile} Cookie header has no ${SESSION_COOKIE_NAME}`);
  return { name: SESSION_COOKIE_NAME, value: match[1] };
}

export function refs() {
  return loadFixture().refs ?? {};
}

/** Adds the profile's session cookie to a Playwright BrowserContext, scoped to baseUrl's origin. */
export async function applyProfileCookie(context, profile, baseUrl) {
  const { name, value } = cookieFor(profile);
  const url = new URL(baseUrl);
  await context.addCookies([
    {
      name,
      value,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

/** Asserts nowhere in a string does the raw session cookie name+value appear (pre-commit grep helper). */
export const SESSION_COOKIE_NAME_EXPORT = SESSION_COOKIE_NAME;
