import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const required = [
  "DEPLOY_HOST",
  "DEPLOY_USER",
  "DEPLOY_PASSWORD",
  "DEPLOY_HOST_KEY"
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const repoUrl =
  process.env.DEPLOY_REPO_URL ??
  "https://github.com/photohunterd-commits/chatGPT_api.git";
const remoteDir = process.env.REMOTE_APP_DIR ?? "/opt/chatgpt_api";
const plink = join(process.cwd(), ".tools", "plink.exe");

if (!existsSync(plink)) {
  console.error("Missing .tools/plink.exe. Download PuTTY plink before deploying.");
  process.exit(1);
}

const remoteCommand = [
  "set -e",
  "export DEBIAN_FRONTEND=noninteractive",
  "if ! command -v docker >/dev/null 2>&1; then apt-get update && apt-get install -y docker.io docker-compose-v2 git; fi",
  "mkdir -p /opt",
  `if [ -d "${remoteDir}/.git" ]; then cd "${remoteDir}" && git pull --ff-only; else rm -rf "${remoteDir}" && git clone "${repoUrl}" "${remoteDir}"; fi`,
  `cd "${remoteDir}"`,
  "mkdir -p data",
  "docker compose up -d --build"
].join(" && ");

const result = spawnSync(
  plink,
  [
    "-ssh",
    "-batch",
    "-hostkey",
    process.env.DEPLOY_HOST_KEY,
    "-pw",
    process.env.DEPLOY_PASSWORD,
    `${process.env.DEPLOY_USER}@${process.env.DEPLOY_HOST}`,
    remoteCommand
  ],
  {
    stdio: "inherit"
  }
);

process.exit(result.status ?? 1);
