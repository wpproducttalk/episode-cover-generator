/**
 * Resolve OPENROUTER_API_KEY for the WPPT lab (never log the value).
 *
 * Order: process.env → lab/wppt/.env → design-kit lab/.env → Bitwarden CLI
 * (requires BW_SESSION — set in shell or lab/wppt/.env from `bw unlock --raw`).
 */
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const assetLabRoot = resolve(here, "../..");

export const BITWARDEN_OPENROUTER_ITEM =
  process.env.BITWARDEN_OPENROUTER_ITEM?.trim() || "OPENROUTER_API_KEY";

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

export function loadEnvFiles() {
  const primaryEnv = join(here, ".env");
  const fallbackEnv = resolve(
    assetLabRoot,
    "..",
    "..",
    "08-Products",
    "design-kit-wp-product-talk",
    "lab",
    ".env"
  );
  loadDotEnv(primaryEnv);
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    loadDotEnv(fallbackEnv);
  }
}

async function bwGet(field, itemName) {
  const session = process.env.BW_SESSION?.trim();
  if (!session) return null;
  try {
    const { stdout } = await execFileAsync(
      "bw",
      ["get", field, itemName],
      {
        env: { ...process.env, BW_SESSION: session },
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }
    );
    const val = stdout.trim();
    return val || null;
  } catch {
    return null;
  }
}

export async function loadOpenRouterKeyFromBitwarden() {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return { key: process.env.OPENROUTER_API_KEY.trim(), source: "env" };
  }

  const item = BITWARDEN_OPENROUTER_ITEM;
  for (const field of ["notes", "password"]) {
    const val = await bwGet(field, item);
    if (val) {
      process.env.OPENROUTER_API_KEY = val;
      return { key: val, source: "bitwarden" };
    }
  }
  return null;
}

export async function hydrateSecrets() {
  loadEnvFiles();
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) {
    return { hasServerKey: true, keySource: "env" };
  }
  const bw = await loadOpenRouterKeyFromBitwarden();
  if (bw) {
    return { hasServerKey: true, keySource: bw.source };
  }
  return {
    hasServerKey: false,
    keySource: process.env.BW_SESSION?.trim() ? "bitwarden_locked_or_missing" : "none",
  };
}
