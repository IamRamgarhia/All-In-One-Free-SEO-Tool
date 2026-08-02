"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { NAV_GROUPS, type NavItem } from "./nav-items";

/**
 * Mobile-only navigation drawer. Hidden ≥md where the regular sidebar
 * takes over. Uses position: fixed so it works on iOS Safari without
 * the dreaded address-bar resize jump.
 *
 * Renders the same NAV_GROUPS as the desktop sidebar. It previously
 * carried its own hardcoded list of 11 links — out of ~226 routes, with
 * eight sharing one generic Sparkles icon — so a phone user could reach
 * roughly a tenth of the app, and the two lists could drift apart with
 * nothing to catch it. Given the product's own note that most SEOs
 * check rankings on a phone, that was the wrong corner to cut.
 *
 * A filter box sits on top because ~25 grouped entries on a phone
 * screen needs one, and it doubles as the fastest path to a tool.
 */
export function MobileNav({
  unreadByHref,
}: {
  unreadByHref?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const unread = unreadByHref ?? {};

  // Close the drawer whenever the route changes.
  //
  // This has to be an effect rather than a Link onClick: it must also
  // fire for back/forward navigation and for any in-app redirect, and
  // in those cases no link in here was clicked. The lint rule below
  // targets render-loop-causing setState; this one is driven by an
  // external event (the router) and settles in a single pass.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it: NavItem) => it.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Clear the filter as part of opening, not in an effect —
          // a stale filter from last time reads as "most of the app is
          // missing", and doing it here avoids a second render pass.
          setQuery("");
          setOpen(true);
        }}
        aria-label="Open menu"
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/40 hover:text-foreground md:hidden"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="relative ml-auto flex h-full w-72 max-w-[85vw] flex-col overflow-hidden bg-card shadow-2xl ring-1 ring-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Navigate</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="border-b border-border px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter…"
                  aria-label="Filter navigation"
                  className="h-9 w-full rounded-md border border-input bg-background/60 pl-8 pr-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {groups.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Nothing matches &ldquo;{query}&rdquo;.
                </p>
              )}
              {groups.map((group) => (
                <div key={group.id} className="mb-1">
                  <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {group.title}
                  </div>
                  <ul>
                    {group.items.map(({ href, label, icon: Icon }: NavItem) => {
                      const isActive =
                        href === "/"
                          ? pathname === "/"
                          : pathname === href || pathname.startsWith(href + "/");
                      const badge = unread[href] ?? 0;
                      return (
                        <li key={href}>
                          <Link
                            href={href}
                            className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "text-foreground/80 hover:bg-accent/50"
                            }`}
                          >
                            <Icon
                              className={`size-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                            />
                            <span className="flex-1 truncate">{label}</span>
                            {badge > 0 && (
                              <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-inset ring-rose-500/40">
                                {badge > 9 ? "9+" : badge}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            {/* No "All tools" shortcut here — it's already the last item
                in Essentials, which is pinned to the top of the list and
                visible without scrolling. A second link to the same
                place is just another thing to read. */}
            <footer className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
              Tap outside to close
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
