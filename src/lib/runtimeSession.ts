const SESSION_STARTED_AT_KEY = "__stackshubRuntimeSessionStartedAt";
const SESSION_EXPIRES_AT_KEY = "__stackshubRuntimeSessionExpiresAt";
const SESSION_LAST_PAYMENT_TXID_KEY = "__stackshubRuntimeSessionLastPaymentTxid";
const VIEWER_ID_KEY = "__stackshubRuntimeViewerId";
const SESSION_PAYWALL_OVERRIDE_KEY = "__stackshubRuntimeSessionPaywall";
export const APP_SESSION_CONTINUATION_OFFER_KEY = "stackshub-session-continuation";

function syncSessionPaywallOverrideFromUrl() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const override = url.searchParams.get("sessionPaywall");
  if (override === "on" || override === "off") {
    window.sessionStorage.setItem(SESSION_PAYWALL_OVERRIDE_KEY, override);
    url.searchParams.delete("sessionPaywall");
    window.history.replaceState({}, "", url.toString());
    return override;
  }
  return null;
}

function readSessionPaywallOverride() {
  if (typeof window === "undefined") return null;
  return syncSessionPaywallOverrideFromUrl()
    ?? window.sessionStorage.getItem(SESSION_PAYWALL_OVERRIDE_KEY);
}

export function setRuntimeSessionPaywallOverride(override: "on" | "off" | null) {
  if (typeof window === "undefined") return;
  if (override === null) {
    window.sessionStorage.removeItem(SESSION_PAYWALL_OVERRIDE_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_PAYWALL_OVERRIDE_KEY, override);
}

function readFreeSessionMinutes() {
  const freeMinutes = Number(import.meta.env.VITE_RUNTIME_FREE_SESSION_MINUTES);
  if (Number.isFinite(freeMinutes) && freeMinutes > 0) return freeMinutes;
  const runtimeMinutes = Number(import.meta.env.VITE_RUNTIME_SESSION_MINUTES);
  if (Number.isFinite(runtimeMinutes) && runtimeMinutes > 0) return runtimeMinutes;
  return 5;
}

function readPaidSessionMinutes() {
  const paidMinutes = Number(import.meta.env.VITE_RUNTIME_PAID_SESSION_MINUTES);
  if (Number.isFinite(paidMinutes) && paidMinutes > 0) return paidMinutes;
  const gateMinutes = Number(import.meta.env.VITE_GATE_SESSION_MINUTES);
  if (Number.isFinite(gateMinutes) && gateMinutes > 0) return gateMinutes;
  return 5;
}

export function getRuntimeFreeSessionDurationMs() {
  return Math.round(readFreeSessionMinutes() * 60 * 1000);
}

export function getRuntimePaidSessionDurationMs() {
  return Math.round(readPaidSessionMinutes() * 60 * 1000);
}

export function isRuntimeSessionPaywallEnabled() {
  if (typeof window === "undefined") return true;
  const override = readSessionPaywallOverride();
  if (override === "off") return false;
  if (override === "on") return true;
  if (import.meta.env.DEV) return false;
  return true;
}

export function getRuntimeSessionModeLabel() {
  return isRuntimeSessionPaywallEnabled() ? "Live Session" : "Local Test Mode";
}

export function ensureRuntimeSessionStarted() {
  if (typeof window === "undefined") return 0;
  const existing = Number(window.sessionStorage.getItem(SESSION_STARTED_AT_KEY));
  if (Number.isFinite(existing) && existing > 0) return existing;
  const startedAt = Date.now();
  window.sessionStorage.setItem(SESSION_STARTED_AT_KEY, String(startedAt));
  window.sessionStorage.setItem(
    SESSION_EXPIRES_AT_KEY,
    String(startedAt + getRuntimeFreeSessionDurationMs()),
  );
  return startedAt;
}

export function getRuntimeSessionStartedAt() {
  if (typeof window === "undefined") return 0;
  const raw = Number(window.sessionStorage.getItem(SESSION_STARTED_AT_KEY));
  return Number.isFinite(raw) ? raw : 0;
}

export function resetRuntimeSessionStartedAt() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_STARTED_AT_KEY);
  window.sessionStorage.removeItem(SESSION_EXPIRES_AT_KEY);
  window.sessionStorage.removeItem(SESSION_LAST_PAYMENT_TXID_KEY);
}

export function getRuntimeSessionRemainingMs() {
  ensureRuntimeSessionStarted();
  const raw = Number(window.sessionStorage.getItem(SESSION_EXPIRES_AT_KEY));
  const expiresAt = Number.isFinite(raw) ? raw : 0;
  return Math.max(0, expiresAt - Date.now());
}

export function getRuntimeSessionExpiresAt() {
  if (typeof window === "undefined") return 0;
  ensureRuntimeSessionStarted();
  const raw = Number(window.sessionStorage.getItem(SESSION_EXPIRES_AT_KEY));
  return Number.isFinite(raw) ? raw : 0;
}

export function grantRuntimePaidContinuation(options?: { paymentTxid?: string | null }) {
  if (typeof window === "undefined") return 0;
  ensureRuntimeSessionStarted();
  const nextExpiresAt =
    Math.max(Date.now(), getRuntimeSessionExpiresAt()) + getRuntimePaidSessionDurationMs();
  window.sessionStorage.setItem(SESSION_EXPIRES_AT_KEY, String(nextExpiresAt));
  if (options?.paymentTxid) {
    window.sessionStorage.setItem(SESSION_LAST_PAYMENT_TXID_KEY, options.paymentTxid);
  }
  return nextExpiresAt;
}

export function getRuntimeSessionLastPaymentTxid() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(SESSION_LAST_PAYMENT_TXID_KEY);
}

export function getOrCreateRuntimeViewerId() {
  if (typeof window === "undefined") return "server-viewer";
  const existing = window.sessionStorage.getItem(VIEWER_ID_KEY);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `viewer-${Math.random().toString(36).slice(2, 10)}`;

  window.sessionStorage.setItem(VIEWER_ID_KEY, id);
  return id;
}
