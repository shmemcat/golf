import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
const root = resolve(import.meta.dirname, "..");
// Reuse the sister site's registry credential locally without copying it.
for (const file of [resolve(root, ".env"), resolve(root, "../euchre/.env")]) {
  if (!process.env.FONTAWESOME_PACKAGE_TOKEN && existsSync(file)) {
    const token = parseEnv(
      readFileSync(file, "utf8")
    ).FONTAWESOME_PACKAGE_TOKEN;
    if (token) process.env.FONTAWESOME_PACKAGE_TOKEN = token;
  }
}
if (!process.env.FONTAWESOME_PACKAGE_TOKEN?.trim()) {
  console.error("Set FONTAWESOME_PACKAGE_TOKEN in Golf/.env (or Euchre/.env).");
  process.exit(1);
}
const npm =
  process.env.npm_execpath ||
  resolve(process.execPath, "../node_modules/npm/bin/npm-cli.js");
const args = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  [npm, ...(args.length ? args : ["ci"])],
  { cwd: resolve(root, "web"), stdio: "inherit" }
);
process.exit(result.status ?? 1);
