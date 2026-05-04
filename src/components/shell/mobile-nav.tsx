"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Search, Home, Users, Sparkles } from "lucide-react";

/**
 * Mobile-only navigation drawer. Hidden ≥md where the regular sidebar
 * takes over. Uses position: fixed so it works on iOS Safari without
 * the dreaded address-bar resize jump.
 */

const QUICK_LINKS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: Sparkles },
  { href: "/audits", label: "Audits", icon: Sparkles },
  { href: "/keywords", label: "Keywords", icon: Search },
  { href: "/reports", label: "Reports", icon: Sparkles },
  { href: "/links", label: "Smart links", icon: Sparkles },
  { href: "/brand-monitor", label: "Brand monitor", icon: Sparkles },
  { href: "/local-grid", label: "Local heatmap", icon: Sparkles },
  { href: "/news", label: "News", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Sparkles },
];

export function MobileNav({
  unreadByHref,
}: {
  unreadByHref?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const unread = unreadByHref ?? {};

  // Close drawer on navigation
  useEffect(() => {
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
          <aside className="relative ml-auto flex h-full w-72 max-w-[85vw] flex-col overflow-hidden bg-card shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold">Navigate</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              <ul>
                {QUICK_LINKS.map(({ href, label, icon: Icon }) => {
                  const isActive =
                    href === "/" ? pathname === "/" : pathname.startsWith(href);
                  const badge = unread[href] ?? 0;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          isActive
                            ? "bg-violet-500/15 text-violet-200"
                            : "text-foreground/80 hover:bg-white/5"
                        }`}
                      >
                        <Icon
                          className={`size-4 ${isActive ? "text-violet-300" : "text-muted-foreground"}`}
                        />
                        <span className="flex-1">{label}</span>
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
            </nav>
            <footer className="border-t border-white/10 px-4 py-3 text-[10px] text-muted-foreground">
              Tap outside to close
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
