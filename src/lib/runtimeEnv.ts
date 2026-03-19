export function isLocalConvexUrl(url?: string | null) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return url.includes("127.0.0.1") || url.includes("localhost");
  }
}
