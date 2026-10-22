/**
 * Canonical key for "same site" checks when adding clients.
 * Treats http/https, www, and trailing slashes as equivalent.
 */
export function clientUrlKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname.toLowerCase();
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    if (path === "/") path = "";
    return `${host}${path}`;
  } catch {
    return trimmed.toLowerCase();
  }
}
