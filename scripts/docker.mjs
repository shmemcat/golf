import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";

const root = resolve(import.meta.dirname, "..");
// Reuse the registry credential without storing it in an image or build argument.
for (const file of [resolve(root, ".env"), resolve(root, "../euchre/.env")]) {
  if (!process.env.FONTAWESOME_PACKAGE_TOKEN && existsSync(file)) {
    const token = parseEnv(readFileSync(file, "utf8")).FONTAWESOME_PACKAGE_TOKEN;
    if (token) process.env.FONTAWESOME_PACKAGE_TOKEN = token;
  }
}

const localConfig = resolve(root, ".local/docker.env");
const result = spawnSync(
  "docker",
  [
    "compose",
    "-f", "docker-compose.yml",
    ...(existsSync(localConfig) ? ["--env-file", localConfig] : []),
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit" }
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
