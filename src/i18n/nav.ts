/** Stable message keys for nav items derived from href. */
export function navItemMessageKey(href: string): string {
  if (href.startsWith("http")) return "blogpilot";
  if (href === "/") return "home";
  return href.replace(/^\//, "").replace(/\//g, "_");
}
