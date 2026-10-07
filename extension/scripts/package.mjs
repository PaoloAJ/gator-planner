// Builds a Chrome Web Store upload: copies the extension to dist/ with
// GatorPlan's production URL in place of localhost, then zips it.
//
//   GATORPLAN_URL=https://gatorplan.example.com node scripts/package.mjs
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;

const url = new URL(process.env.GATORPLAN_URL ?? "");
if (url.protocol !== "https:") throw new Error("GATORPLAN_URL must be an https:// URL");
const origin = url.origin;

rmSync(dist, { recursive: true, force: true });
for (const path of ["manifest.json", "src", "popup", "icons"]) cpSync(`${root}${path}`, `${dist}/${path}`, { recursive: true });

const manifestPath = `${dist}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const cs of manifest.content_scripts) {
  cs.matches = cs.matches.map((m) => (m === "http://localhost:3000/*" ? `${origin}/*` : m));
}
manifest.homepage_url = origin;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const configPath = `${dist}/src/config.js`;
writeFileSync(configPath, readFileSync(configPath, "utf8").replace('"http://localhost:3000"', JSON.stringify(origin)));

const zip = `gatorplan-extension-${manifest.version}.zip`;
rmSync(`${root}${zip}`, { force: true });
execFileSync("zip", ["-qr", `../${zip}`, "."], { cwd: dist, stdio: "inherit" });
console.log(`Built ${zip} for ${origin}`);
