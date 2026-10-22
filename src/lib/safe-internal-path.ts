/**
 * Sanitize post-login redirects. Rejects open redirects and paths that
 * cannot exist in this app router (protocol-relative, backslashes, etc.).
 */
export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed.includes("\\") || trimmed.includes("\0")) return "/";

  try {
    const u = new URL(trimmed, "http://localhost");
    if (u.hostname !== "localhost") return "/";
    if (trimmed.includes("..")) return "/";
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.some((s) => s === "..")) return "/";
    const path = u.pathname + u.search + u.hash;
    return path || "/";
  } catch {
    return "/";
  }
}
