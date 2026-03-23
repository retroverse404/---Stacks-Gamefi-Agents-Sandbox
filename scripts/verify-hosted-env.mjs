#!/usr/bin/env node

function fail(message) {
  console.error(`Hosted build env check failed: ${message}`);
  process.exit(1);
}

function read(name) {
  return (process.env[name] || "").trim();
}

function isLocalUrl(value) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(value);
}

const convexUrl = read("VITE_CONVEX_URL");
const x402Url = read("VITE_X402_API_URL");
const appEnv = read("VITE_APP_ENV");

if (!convexUrl) {
  fail("VITE_CONVEX_URL is missing.");
}

if (!x402Url) {
  fail("VITE_X402_API_URL is missing.");
}

if (isLocalUrl(convexUrl)) {
  fail(`VITE_CONVEX_URL points at a local backend: ${convexUrl}`);
}

if (isLocalUrl(x402Url)) {
  fail(`VITE_X402_API_URL points at a local x402 host: ${x402Url}`);
}

try {
  new URL(convexUrl);
} catch {
  fail(`VITE_CONVEX_URL is not a valid URL: ${convexUrl}`);
}

try {
  new URL(x402Url);
} catch {
  fail(`VITE_X402_API_URL is not a valid URL: ${x402Url}`);
}

if (!appEnv) {
  console.warn("Hosted build env check: VITE_APP_ENV is not set. Consider using preview or production.");
}

console.log("Hosted build env check passed.");
