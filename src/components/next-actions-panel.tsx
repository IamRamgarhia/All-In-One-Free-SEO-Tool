import Link from "next/link";
import { ArrowRight, Bot, Clock, User } from "lucide-react";
import {
  partitionByOwner,
  type NextAction,
} from "@/lib/next-actions";

/**
 * The ranked "what to do next" list.
 *
 * Split by who does it, because that is the question a person actually
 * has when they open this app in the morning: which of this is already
 * handled, and which of it is mine. A single merged list answers neither
 * — it reads as a to-do list of forty items, and a to-do list of forty
 * items is one nobody opens twice.
 *
 * Every row carries its own reason. A ranking you cannot argue with is
 * one you end up ignoring, so `because` says exactly what produced the
 * item — "23 open findings match a fixable type" — rather than asking
 * the reader to trust a number.
 */
export function NextActionsPanel({
  items,
  heading = "What's worth doing",
  emptyNote = "Nothing pressing. Run an audit or add a client to give this something to rank.",
  showClient = true,
}: {
  items: NextAction[];
  heading?: string;
  /** Shown when there is genuinely nothing — not an error state. */
  emptyNote?: string;
  /**
   * Off on a single client's own page, where naming them on every row
   * says nothing and crowds out the part that does.
   */
  showClient?: boolean;
}) {
  const { agent, you } = partitionByOwner(items);

  return (
    <section className="glass-apple overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{heading}</h2>
        <p className="text-xs text-muted-foreground">
          Ranked by what it changes against how long it takes.
        </p>
        {items.length > 0 && (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {items.length} ranked
          </span>
        )}
      </header>

      {items.length === 0 ? (
        <p className="px-4 py-5 text-xs text-muted-foreground">{emptyNote}</p>
      ) : (
        <div className="divide-y divide-border">
          {agent.length > 0 && (
            <Group
              icon={Bot}
              label="The agent can do these"
              note="No decision needed from you."
              tone="text-emerald-600 dark:text-emerald-300"
              items={agent}
              showClient={showClient}
            />
          )}
          {you.length > 0 && (
            <Group
              icon={User}
              label="These need you"
              note="A decision, a login, or someone who knows the business."
              tone="text-violet-600 dark:text-violet-300"
              items={you}
              showClient={showClient}
            />
          )}
        </div>
      )}
    </section>
  );
}

function Group({
  icon: Icon,
  label,
  note,
  tone,
  items,
  showClient,
}: {
  icon: typeof Bot;
  label: string;
  note: string;
  tone: string;
  items: NextAction[];
  showClient: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 bg-muted/40 px-4 py-1.5">
        <Icon className={`size-3.5 shrink-0 ${tone}`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${tone}`}>
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground">{note}</span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium leading-tight">
                    {a.title}
                  </span>
                  {showClient && (
                    <span className="text-[11px] text-muted-foreground">
                      {a.clientName}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {a.why}
                </span>
                {/* The evidence. Shown so the order can be disputed rather
                    than taken on faith. */}
                <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                  {a.because}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                <Clock className="size-2.5" />
                {a.minutes}m
              </span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
