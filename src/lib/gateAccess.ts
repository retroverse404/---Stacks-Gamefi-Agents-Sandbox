const GATE_ENABLED_FLAG = "VITE_GATE_ENABLED";
const GATE_CODES_FLAG = "VITE_GATE_INVITE_CODES";
const GATE_UNLOCK_KEY = "__stackshubGateUnlocked";
const GATE_EXPIRES_AT_KEY = "__stackshubGateExpiresAt";

function parseInviteCodes(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getConfiguredInviteCodes() {
  return parseInviteCodes(import.meta.env[GATE_CODES_FLAG] as string | undefined);
}

export function isGateEnabled() {
  return (import.meta.env[GATE_ENABLED_FLAG] as string | undefined) === "1" && getConfiguredInviteCodes().length > 0;
}

export function isGateUnlocked() {
  if (typeof window === "undefined") return false;
  if (window.sessionStorage.getItem(GATE_UNLOCK_KEY) !== "1") return false;
  const expiresAt = getGateExpiresAt();
  if (expiresAt <= Date.now()) {
    clearGateUnlocked();
    return false;
  }
  return true;
}

export function markGateUnlocked() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(GATE_UNLOCK_KEY, "1");
  window.sessionStorage.setItem(GATE_EXPIRES_AT_KEY, String(Date.now() + getGateSessionDurationMs()));
}

export function clearGateUnlocked() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(GATE_UNLOCK_KEY);
  window.sessionStorage.removeItem(GATE_EXPIRES_AT_KEY);
}

export function validateInviteCode(candidate: string) {
  const normalized = candidate.trim();
  if (!normalized) return false;
  return getConfiguredInviteCodes().includes(normalized);
}

export function getInviteCodeFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("invite");
}

export function stripInviteCodeFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite")) return;
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url.toString());
}

export function getGateSessionDurationMs() {
  const raw = Number(import.meta.env.VITE_GATE_SESSION_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : 5;
  return Math.round(minutes * 60 * 1000);
}

export function getGateExpiresAt() {
  if (typeof window === "undefined") return 0;
  const raw = Number(window.sessionStorage.getItem(GATE_EXPIRES_AT_KEY));
  return Number.isFinite(raw) ? raw : 0;
}

export function getGateRemainingMs() {
  const expiresAt = getGateExpiresAt();
  return Math.max(0, expiresAt - Date.now());
}
