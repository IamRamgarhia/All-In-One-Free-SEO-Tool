"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Users,
  ListChecks,
  Activity,
  ClipboardList,
  Network,
  FileText,
  CommandIcon,
  Send,
  Receipt,
  Link2,
} from "lucide-react";
import { search, type SearchHit } from "@/app/search/actions";

const typeIcon: Record<SearchHit["type"], typeof Users> = {
  client: Users,
  task: ListChecks,
  keyword: Activity,
  audit: ClipboardList,
  competitor: Network,
  brief: FileText,
  outreach: Send,
  invoice: Receipt,
  resource: Link2,
};

const typeTone: Record<SearchHit["type"], string> = {
  client: "text-violet-300 bg-violet-500/15 ring-violet-500/30",
  task: "text-amber-300 bg-amber-500/15 ring-amber-500/30",
  keyword: "text-cyan-300 bg-cyan-500/15 ring-cyan-500/30",
  audit: "text-cyan-300 bg-cyan-500/15 ring-cyan-500/30",
  competitor: "text-rose-300 bg-rose-500/15 ring-rose-500/30",
  brief: "text-emerald-300 bg-emerald-500/15 ring-emerald-500/30",
  outreach: "text-violet-300 bg-violet-500/15 ring-violet-500/30",
  invoice: "text-amber-300 bg-amber-500/15 ring-amber-500/30",
  resource: "text-emerald-300 bg-emerald-500/15 ring-emerald-500/30",
};

const typeLabel: Record<SearchHit["type"], string> = {
  client: "Client",
  task: "Task",
  keyword: "Keyword",
  audit: "Audit",
  competitor: "Competitor",
  brief: "Brief",
  outreach: "Outreach",
  invoice: "Invoice",
  resource: "Resource",
};

export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl + K opens; / opens (when not in an input); Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    // Reset when closing — defer to next tick so React doesn't flag this
    // as setState-in-effect.
    const t = setTimeout(() => {
      setQuery("");
      setHits([]);
      setActive(0);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (query.trim().length === 0) {
        setHits([]);
        return;
      }
      startTransition(async () => {
        const r = await search(query);
        setHits(r.hits);
        setActive(0);
      });
    }, 120);
    return () => clearTimeout(t);
  }, [query, open]);

  const grouped = useMemo(() => {
    const groups = new Map<SearchHit["type"], SearchHit[]>();
    for (const h of hits) {
      const list = groups.get(h.type) ?? [];
      list.push(h);
      groups.set(h.type, list);
    }
    return Array.from(groups.entries());
  }, [hits]);

  const navigate = useCallback(
    (hit: SearchHit) => {
      router.push(hit.href);
      setOpen(false);
    },
    [router],
  );

  // Keyboard nav within results
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) navigate(hit);
    }
  };

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-9 max-w-md flex-1 items-center gap-2 rounded-lg border border-white/10 bg-card/60 px-3 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:bg-white/5"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">
          Search clients, keywords, tasks…
        </span>
        <kbd className="hidden items-center gap-0.5 rounded-md border border-white/10 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
          <CommandIcon className="size-3" />
          K
        </kbd>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-[10vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-2xl shadow-violet-500/10 backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search clients, keywords, tasks, audits, competitors, briefs…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {query.trim().length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Start typing to search across everything you&apos;ve added.
                </div>
              ) : pending && hits.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Searching…
                </div>
              ) : hits.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                  No matches for{" "}
                  <span className="font-mono text-foreground">{query}</span>.
                </div>
              ) : (
                <div className="py-2">
                  {grouped.map(([type, items]) => (
                    <div key={type} className="px-2 pb-1">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {typeLabel[type]}s
                      </div>
                      <ul>
                        {items.map((hit) => {
                          const Icon = typeIcon[hit.type];
                          const idx = hits.indexOf(hit);
                          const isActive = idx === active;
                          return (
                            <li key={`${hit.type}-${hit.id}`}>
                              <button
                                type="button"
                                onClick={() => navigate(hit)}
                                onMouseEnter={() => setActive(idx)}
                                className={
                                  isActive
                                    ? "flex w-full items-center gap-3 rounded-md bg-violet-500/15 px-2.5 py-2 text-left text-sm ring-1 ring-inset ring-violet-500/30"
                                    : "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white/5"
                                }
                              >
                                <span
                                  className={`flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${typeTone[hit.type]}`}
                                >
                                  <Icon className="size-3.5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">
                                    {hit.title}
                                  </div>
                                  {hit.subtitle && (
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {hit.subtitle}
                                    </div>
                                  )}
                                </div>
                                <kbd className="hidden text-[10px] text-muted-foreground sm:block">
                                  ↵
                                </kbd>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <span>
                  <kbd className="rounded bg-white/5 px-1 py-0.5 ring-1 ring-inset ring-white/10">
                    ↑↓
                  </kbd>{" "}
                  navigate
                </span>
                <span>
                  <kbd className="rounded bg-white/5 px-1 py-0.5 ring-1 ring-inset ring-white/10">
                    ↵
                  </kbd>{" "}
                  open
                </span>
                <span>
                  <kbd className="rounded bg-white/5 px-1 py-0.5 ring-1 ring-inset ring-white/10">
                    esc
                  </kbd>{" "}
                  close
                </span>
              </span>
              <span>{hits.length} result{hits.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
