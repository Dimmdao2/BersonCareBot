import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/**
 * @param {string} filePath
 * @param {string} startMarker
 */
function hashFromMarker(filePath, startMarker) {
  const s = readFileSync(filePath, "utf8");
  const start = s.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`check-hls-helpers-sync: marker not found in ${filePath}: ${startMarker}`);
  }
  return createHash("sha256").update(s.slice(start)).digest("hex");
}

const pairs = [
  {
    name: "hlsStorageLayout",
    a: join(root, "apps/webapp/src/shared/lib/hlsStorageLayout.ts"),
    b: join(root, "apps/media-worker/src/hlsStorageLayout.ts"),
    marker: "export function mediaRootFromSourceS3Key",
  },
  {
    name: "hlsMasterPlaylist",
    a: join(root, "apps/webapp/src/shared/lib/hlsMasterPlaylist.ts"),
    b: join(root, "apps/media-worker/src/hlsMasterPlaylist.ts"),
    marker: "export type MasterVariantEntry",
  },
];

let failed = false;
for (const { name, a, b, marker } of pairs) {
  const ha = hashFromMarker(a, marker);
  const hb = hashFromMarker(b, marker);
  if (ha !== hb) {
    console.error(
      `check-hls-helpers-sync: ${name} mismatch (webapp vs media-worker from "${marker.slice(0, 40)}…")`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("check-hls-helpers-sync: OK");
