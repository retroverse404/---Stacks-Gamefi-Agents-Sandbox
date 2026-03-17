#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execFileSync } from "child_process";

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const lines = readFileSync(path, "utf8").split("\n");
  const env = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

function checkUrl(label, url) {
  if (!url) {
    return { label, ok: false, detail: "not configured" };
  }
  try {
    const status = execFileSync(
      "curl",
      ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "3", url],
      { encoding: "utf8" },
    ).trim();
    return {
      label,
      ok: /^2\d\d$|^3\d\d$/.test(status),
      detail: status || "no status",
    };
  } catch (error) {
    return {
      label,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function readConvexEnvNames(appRoot) {
  try {
    const raw = execFileSync("npx", ["convex", "env", "list"], {
      cwd: appRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    const names = new Set();
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=/);
      if (match) names.add(match[1]);
    }
    return names;
  } catch {
    return new Set();
  }
}

const appRoot = process.cwd();
const appEnv = readEnvFile(resolve(appRoot, ".env.local"));
const x402Env = readEnvFile(resolve(appRoot, "services/x402-api/.env.local"));

const convexUrl = appEnv.VITE_CONVEX_URL || "";
const convexSiteUrl = appEnv.VITE_CONVEX_SITE_URL || "";
const x402HealthUrl = "http://127.0.0.1:4020/health";
const frontendUrl = "http://127.0.0.1:5173/";
const convexEnvNames = readConvexEnvNames(appRoot);

console.log("== TinyRealms Demo Doctor ==");
console.log("");
console.log("App environment");
console.log(`- CONVEX_DEPLOYMENT: ${appEnv.CONVEX_DEPLOYMENT || "(missing)"}`);
console.log(`- VITE_CONVEX_URL: ${convexUrl || "(missing)"}`);
console.log(`- VITE_CONVEX_SITE_URL: ${convexSiteUrl || "(missing)"}`);
console.log("");
console.log("x402 environment");
console.log(`- NETWORK: ${x402Env.NETWORK || "(missing)"}`);
console.log(`- SERVER_ADDRESS configured: ${yesNo(x402Env.SERVER_ADDRESS)}`);
console.log(`- GUIDE_SERVER_ADDRESS configured: ${yesNo(x402Env.GUIDE_SERVER_ADDRESS)}`);
console.log(`- MARKET_SERVER_ADDRESS configured: ${yesNo(x402Env.MARKET_SERVER_ADDRESS)}`);
console.log(`- MEL_SERVER_ADDRESS configured: ${yesNo(x402Env.MEL_SERVER_ADDRESS)}`);
console.log(
  `- DEPLOYER_PRIVATE_KEY or STACKS_PRIVATE_KEY configured: ${yesNo(
    x402Env.DEPLOYER_PRIVATE_KEY || x402Env.STACKS_PRIVATE_KEY,
  )}`,
);
console.log(`- CONVEX_URL configured: ${yesNo(x402Env.CONVEX_URL)}`);
console.log("");
console.log("Convex runtime environment");
console.log(`- BRAINTRUST_API_KEY configured: ${yesNo(convexEnvNames.has("BRAINTRUST_API_KEY"))}`);
console.log(`- BRAINTRUST_MODEL configured: ${yesNo(convexEnvNames.has("BRAINTRUST_MODEL"))}`);
console.log(`- BRAINTRUST_ALLOWED_MODELS configured: ${yesNo(convexEnvNames.has("BRAINTRUST_ALLOWED_MODELS"))}`);
console.log("");

const checks = [
  checkUrl("frontend", frontendUrl),
  checkUrl("convex", convexUrl),
  checkUrl("convex-site", convexSiteUrl),
  checkUrl("x402-health", x402HealthUrl),
];

console.log("Reachability");
for (const check of checks) {
  console.log(`- ${check.label}: ${check.ok ? "ok" : "fail"} (${check.detail})`);
}

const failures = checks.filter((check) => !check.ok);

console.log("");
console.log("Demo-critical expectations");
console.log(`- App points to one Convex deployment: ${yesNo(Boolean(appEnv.CONVEX_DEPLOYMENT && convexUrl))}`);
console.log(`- x402 signer key present: ${yesNo(Boolean(x402Env.DEPLOYER_PRIVATE_KEY || x402Env.STACKS_PRIVATE_KEY))}`);
console.log(`- x402 can log back to Convex: ${yesNo(Boolean(x402Env.CONVEX_URL))}`);
console.log(`- Braintrust is configured in active Convex deployment: ${yesNo(convexEnvNames.has("BRAINTRUST_API_KEY"))}`);
console.log("");

if (failures.length === 0) {
  console.log("Doctor result: ready for manual premium-flow verification.");
} else {
  console.log("Doctor result: not ready.");
  console.log("Fix the failed reachability checks before recording the demo.");
}
