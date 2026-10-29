"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  Play,
  Power,
  PowerOff,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createSchedule,
  deleteSchedule,
  runScheduleNow,
  toggleScheduleEnabled,
  updateSchedule,
  type CreateScheduleState,
} from "./actions";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import type { DailySchedule } from "@/db/schema";

type Kind = DailySchedule["kind"];

// Per-kind metadata. Class strings are stored literal so Tailwind's
// JIT picks them up — `text-${color}-300` wouldn't work.
const KIND_META: Record<
  Kind,
  {
    label: string;
    description: string;
    icon: typeof FileText;
    iconCls: string;
    activeBorder: string;
    badge: string;
  }
> = {
  blog_draft: {
    label: "Blog post",
    description: "AI drafts an 800-1200 word post and lands it in WordPress as a draft.",
    icon: FileText,
    iconCls: "text-violet-300",
    activeBorder: "border-violet-500/40 bg-violet-500/[0.04]",
    badge: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
  gbp_post: {
    label: "Google Business Profile post",
    description: "≤1300 char local post published via GBP API. Needs a location set.",
    icon: Globe,
    iconCls: "text-cyan-300",
    activeBorder: "border-cyan-500/40 bg-cyan-500/[0.04]",
    badge: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
  social_post: {
    label: "Social post (X + LinkedIn)",
    description: "Generates platform-specific copy. Copy/paste manually — no auto-OAuth in v1.",
    icon: Share2,
    iconCls: "text-amber-300",
    activeBorder: "border-amber-500/40 bg-amber-500/[0.04]",
    badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  internal_checklist: {
    label: "Daily task checklist",
    description: "Seeds 3-5 tasks into this client's task list every morning.",
    icon: Megaphone,
    iconCls: "text-emerald-300",
    activeBorder: "border-emerald-500/40 bg-emerald-500/[0.04]",
    badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
};

function formatTime(timeUtc: number): string {
  const hh = Math.floor(timeUtc / 100);
  const mm = timeUtc % 100;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} UTC`;
}

function formatCadence(days: number): string {
  if (days === 1) return "daily";
  if (days === 7) return "weekly";
  if (days === 30) return "monthly";
  return `every ${days} days`;
}

type Destination = "local" | "wordpress" | "gbp";

export function SchedulesEditor({
  clientId,
  wpConnected,
  gbpUrl,
  schedules,
  trackedKeywords = [],
}: {
  clientId: number;
  /** Reserved for future per-client title context; kept on the type for parity with the page. */
  clientName?: string;
  wpConnected: boolean;
  gbpUrl: string | null;
  schedules: DailySchedule[];
  /** Client's tracked keywords, shown as what "Top keywords" will use */
  trackedKeywords?: string[];
}) {
  const [showForm, setShowForm] = useState(schedules.length === 0);
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      {/* Connection status — informational, not blocking */}
      <div className="glass-apple relative overflow-hidden rounded-2xl px-4 py-3 text-xs">
        <p className="font-medium">Where your drafts can go:</p>
        <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
          <li>
            <span className="text-emerald-300">●</span> Save in this tool — always
            available, no setup
          </li>
          <li>
            <span
              className={wpConnected ? "text-violet-300" : "text-muted-foreground/50"}
            >
              ●
            </span>{" "}
            WordPress — {wpConnected ? "connected for this client" : "not connected (set up the WP bridge below to enable)"}
          </li>
          <li>
            <span className={gbpUrl ? "text-cyan-300" : "text-muted-foreground/50"}>●</span>{" "}
            Google Business Profile —{" "}
            {gbpUrl
              ? "available; enter the location name on the GBP schedule"
              : "no GBP URL on this client yet"}
          </li>
        </ul>
      </div>

      {/* Existing schedules */}
      {schedules.length > 0 && (
        <ul className="space-y-2">
          {schedules.map((s) =>
            editingId === s.id ? (
              <li key={s.id}>
                <ScheduleForm
                  key={s.id}
                  clientId={clientId}
                  wpConnected={wpConnected}
                  trackedKeywords={trackedKeywords}
                  schedule={s}
                  onClose={() => setEditingId(null)}
                />
              </li>
            ) : (
              <ScheduleRow
                key={s.id}
                schedule={s}
                clientId={clientId}
                onEdit={() => {
                  setShowForm(false);
                  setEditingId(s.id);
                }}
              />
            ),
          )}
        </ul>
      )}

      {/* Add new */}
      {!showForm ? (
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25"
        >
          <Plus className="size-4" />
          Add a schedule
        </button>
      ) : (
        <ScheduleForm
          clientId={clientId}
          wpConnected={wpConnected}
          trackedKeywords={trackedKeywords}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

/** Config shape stored on a schedule (see parseScheduleForm in actions.ts). */
type ScheduleConfig = {
  topic_seed?: string;
  tone?: string;
  ai_brief?: string;
  claude_prompt?: string;
  claude_auto_send?: boolean;
  destination?: string;
  gbp_location_name?: string;
  post_type?: string;
  gbp_source?: string;
  max_chars?: number;
  blog_source?: string;
  offer_coupon?: string;
  social_source?: string;
  keywords_mode?: string;
  keywords_custom?: string[];
  cta_type?: string;
  button_text?: string;
  button_text_2?: string;
};

const POST_LENGTHS = [300, 600, 1000];

/**
 * Create a schedule, or — when `schedule` is passed — edit that one in
 * place. The kind is fixed while editing; every other field is prefilled.
 */
function ScheduleForm({
  clientId,
  wpConnected,
  trackedKeywords,
  schedule,
  onClose,
}: {
  clientId: number;
  wpConnected: boolean;
  trackedKeywords: string[];
  schedule?: DailySchedule;
  onClose: () => void;
}) {
  const editing = Boolean(schedule);
  const cfg = (schedule?.configJson ?? {}) as ScheduleConfig;
  const savedLength = cfg.max_chars ?? 300;
  // Schedules saved before the 1500 cap was dropped fall to the nearest option.
  const initialLength = String(
    POST_LENGTHS.find((n) => n >= savedLength) ?? POST_LENGTHS.at(-1),
  );

  const [selectedKind, setSelectedKind] = useState<Kind>(
    schedule?.kind ?? "blog_draft",
  );
  const [postType, setPostType] = useState(cfg.post_type ?? "STANDARD");
  const [blogSource, setBlogSource] = useState(cfg.blog_source ?? "topic");
  const [socialSource, setSocialSource] = useState(cfg.social_source ?? "topic");
  const [keywordsMode, setKeywordsMode] = useState(cfg.keywords_mode ?? "top");
  const [selectedDestination, setSelectedDestination] = useState<Destination>(
    (cfg.destination as Destination | undefined) ?? "local",
  );
  const [state, formAction, pending] = useActionState<
    CreateScheduleState,
    FormData
  >(editing ? updateSchedule : createSchedule, null);

  // What destinations are valid for the selected kind? Social + checklist
  // are local-only by design.
  const allowedDestinations: Destination[] =
    selectedKind === "blog_draft"
      ? ["local", "wordpress"]
      : selectedKind === "gbp_post"
        ? ["local", "gbp"]
        : ["local"];

  // If the user switches to a kind where the current destination is no
  // longer valid, snap back to local.
  //
  // Resolved during render rather than in an effect. Whether the current
  // destination is still valid is a pure function of the two state
  // values above, so there is nothing to synchronise after the fact —
  // and the effect version let one frame commit with the dropdown
  // showing a value that wasn't in its own option list before correcting
  // itself. React discards this render and restarts before paint.
  const destinationValid = allowedDestinations.includes(selectedDestination);
  if (!destinationValid) {
    setSelectedDestination("local");
  }

  // Close the edit form once the changes are saved.
  useEffect(() => {
    if (editing && state?.ok) {
      toast.success("Schedule updated.");
      onClose();
    }
  }, [editing, state, onClose]);

  return (
    <form
      action={formAction}
      className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      {schedule && (
        <input type="hidden" name="scheduleId" value={schedule.id} />
      )}

      <div>
        <label className="text-sm font-semibold">What to automate</label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {editing
            ? "The kind is fixed — create a new schedule to automate something else."
            : "Pick the kind first — the form below adapts."}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.keys(KIND_META) as Kind[])
            .filter((k) => !editing || k === selectedKind)
            .map((k) => {
            const meta = KIND_META[k];
            const active = selectedKind === k;
            const Icon = meta.icon;
            return (
              <label
                key={k}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                  active
                    ? meta.activeBorder
                    : "border-white/10 hover:bg-white/[0.03]"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={active}
                  onChange={() => setSelectedKind(k)}
                  className="sr-only"
                />
                <Icon className={`size-4 shrink-0 mt-0.5 ${meta.iconCls}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {meta.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {meta.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Destination */}
      <div>
        <label className="text-sm font-semibold">
          Where should approved items go?
        </label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Local = stays in the review queue for you to copy/paste. No
          connection needed.
        </p>
        <input
          type="hidden"
          name="destination"
          value={selectedDestination}
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <DestinationRadio
            value="local"
            title="Save in this tool"
            description="Draft lives in the queue. Copy to clipboard or download as Markdown / HTML."
            active={selectedDestination === "local"}
            disabled={false}
            onClick={() => setSelectedDestination("local")}
          />
          {allowedDestinations.includes("wordpress") && (
            <DestinationRadio
              value="wordpress"
              title="Publish to WordPress"
              description={
                wpConnected
                  ? "Auto-creates a post via the SEO Tool Bridge plugin."
                  : "Requires the WP bridge — set it up under the WordPress section below."
              }
              active={selectedDestination === "wordpress"}
              disabled={!wpConnected}
              onClick={() => wpConnected && setSelectedDestination("wordpress")}
            />
          )}
          {allowedDestinations.includes("gbp") && (
            <DestinationRadio
              value="gbp"
              title="Publish to GBP"
              description="Auto-posts via the Google Business Profile API. Location name required below."
              active={selectedDestination === "gbp"}
              disabled={false}
              onClick={() => setSelectedDestination("gbp")}
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Cadence</span>
          <select
            name="cadenceDays"
            defaultValue={String(schedule?.cadenceDays ?? 1)}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="1">Daily</option>
            <option value="7">Weekly</option>
            <option value="14">Every 2 weeks</option>
            <option value="30">Monthly</option>
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Run time (UTC) — HHMM
          </span>
          <input
            type="number"
            name="timeUtc"
            defaultValue={schedule?.timeUtc ?? 900}
            min={0}
            max={2359}
            step={100}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
      </div>

      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Topic seed / focus</span>
        <input
          name="topicSeed"
          defaultValue={cfg.topic_seed ?? ""}
          placeholder={
            selectedKind === "blog_draft"
              ? "espresso accessories for home baristas"
              : selectedKind === "gbp_post"
                ? "new fall menu launch"
                : "weekly business tips"
          }
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <span className="text-[10px] text-muted-foreground">
          The AI uses this as the starting angle each run. Leave blank to
          let the AI pick freely from the client&apos;s niche.
        </span>
      </label>

      <label className="space-y-1 text-xs">
        <span className="text-muted-foreground">Tone</span>
        <input
          name="tone"
          defaultValue={cfg.tone ?? ""}
          placeholder="professional, plain English"
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>

      {selectedKind === "blog_draft" && (
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            AI brief for the .md export (optional)
          </span>
          <textarea
            name="aiBrief"
            rows={3}
            maxLength={2000}
            defaultValue={cfg.ai_brief ?? ""}
            placeholder="Leave blank to use the default: expand sections, add an FAQ, internal link and image placeholders, keep the keywords."
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <span className="text-[10px] text-muted-foreground">
            Written into the &quot;Download .md for AI&quot; file so another AI
            knows how to enrich the draft (Astro, Next.js, any static site).
          </span>
        </label>
      )}

      {selectedKind === "blog_draft" && (
        <div className="space-y-2 rounded-md border border-white/10 p-3 text-xs">
          <label className="block space-y-1">
            <span className="text-muted-foreground">
              Text for Claude when you press &quot;Open in Claude&quot; (optional)
            </span>
            <textarea
              name="claudePrompt"
              rows={3}
              maxLength={2000}
              defaultValue={cfg.claude_prompt ?? ""}
              placeholder="e.g. Add this article to the blog as a new page, with internal links and a hero image placeholder, then open a pull request."
              className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="claudeAutoSend"
              defaultChecked={cfg.claude_auto_send === true}
              className="mt-0.5"
            />
            <span>
              Send this text to Claude automatically, together with the .md file.
              <span className="block text-[10px] text-muted-foreground">
                Off: the chat opens with the .md attached and waits for you to say
                what to do. Needs the text above and a Local project folder on the client.
              </span>
            </span>
          </label>
        </div>
      )}

      {selectedKind === "blog_draft" && (
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Article about</span>
          <select
            name="blogSource"
            value={blogSource}
            onChange={(e) => setBlogSource(e.target.value)}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="topic">A topic (AI picks the angle)</option>
            <option value="woo_product">
              One product from the shop (photo + buy buttons)
            </option>
            <option value="woo_products">
              Several products, roundup (3, each with photo + buy buttons)
            </option>
          </select>
          <span className="text-[10px] text-muted-foreground">
            Product options need a WooCommerce shop on the client&apos;s
            website (no WordPress connection needed to write them).
            Products come from that shop&apos;s catalogue. Each run mixes products matching the
            keywords below, the newest arrivals and a random pick, and
            skips products used recently.
          </span>
        </label>
      )}

      {selectedKind === "blog_draft" && blogSource !== "topic" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Main button text</span>
            <input
              name="buttonText"
              defaultValue={cfg.button_text ?? ""}
              placeholder="Buy now (default: AI writes it in the article's language)"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Second button text</span>
            <input
              name="buttonText2"
              defaultValue={cfg.button_text_2 ?? ""}
              placeholder="See details"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
      )}

      {selectedKind === "social_post" && (
        <>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Post about</span>
            <select
              name="socialSource"
              value={socialSource}
              onChange={(e) => setSocialSource(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="topic">A topic (AI picks the angle)</option>
              <option value="woo_product">
                A product from the shop (link + photo)
              </option>
            </select>
          </label>
          {socialSource === "woo_product" && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                Call-to-action text
              </span>
              <input
                name="buttonText"
                defaultValue={cfg.button_text ?? ""}
                placeholder="Shop now (default: AI writes it in the post's language)"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <span className="text-[10px] text-muted-foreground">
                Added before the product link at the end of every
                variant.
              </span>
            </label>
          )}
        </>
      )}

      {selectedKind !== "internal_checklist" && (
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Keywords</span>
          <select
            name="keywordsMode"
            value={keywordsMode}
            onChange={(e) => setKeywordsMode(e.target.value)}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="top">Top tracked keywords (best ranking)</option>
            <option value="planner">
              Keyword Planner ideas (found for me)
            </option>
            <option value="custom">Only the keywords I type</option>
          </select>
          {keywordsMode === "custom" && (
            <input
              name="keywordsCustom"
              defaultValue={(cfg.keywords_custom ?? []).join(", ")}
              placeholder="espresso machine, coffee grinder, …"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          )}
          <span className="text-[10px] text-muted-foreground">
            Used in the text and to choose which products to feature.
            {keywordsMode === "planner" &&
              " Google Keyword Planner suggests new keywords for this site, best volume with least competition first, a few per run. Needs Google Ads under Settings → Google; until then the top tracked keywords are used."}
            {keywordsMode === "top" &&
              (trackedKeywords.length > 0
                ? ` Tracked now: ${trackedKeywords.slice(0, 8).join(", ")}${trackedKeywords.length > 8 ? "…" : ""}`
                : " This client has no tracked keywords yet — add some under Tracked keywords.")}
          </span>
        </label>
      )}

      {selectedKind === "gbp_post" && (
        <>
          {selectedDestination === "gbp" && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                GBP location name
              </span>
              <input
                name="gbpLocationName"
                defaultValue={cfg.gbp_location_name ?? ""}
                placeholder="Leave empty to use the client’s listing"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <span className="text-[10px] text-muted-foreground">
                Optional override (accounts/…/locations/…). By default
                posts go to the listing chosen on this client’s GBP →
                Reviews page.
              </span>
            </label>
          )}
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Content</span>
            <select
              name="gbpSource"
              defaultValue={cfg.gbp_source ?? "topic"}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="topic">Topic post (AI picks the angle)</option>
              <option value="woo_product">
                Product from the shop (photo + Shop button)
              </option>
            </select>
            <span className="text-[10px] text-muted-foreground">
              Product posts read the WooCommerce catalogue on the
              client&apos;s website and rotate through in-stock products.
            </span>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Post length</span>
            <select
              name="maxChars"
              defaultValue={initialLength}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="300">Short (≤ 300 characters)</option>
              <option value="600">Medium (≤ 600 characters)</option>
              <option value="1000">Long (≤ 1000 characters)</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Button</span>
            <select
              name="ctaType"
              defaultValue={cfg.cta_type ?? "auto"}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="auto">
                Auto (Shop for products, AI picks for topics)
              </option>
              <option value="SHOP">Shop</option>
              <option value="ORDER">Order online</option>
              <option value="LEARN_MORE">Learn more</option>
              <option value="BOOK">Book</option>
              <option value="SIGN_UP">Sign up</option>
              <option value="CALL">Call now</option>
            </select>
            <span className="text-[10px] text-muted-foreground">
              Product posts link the button to the product page; topic
              posts to the website. Offer posts use &quot;View
              offer&quot; instead.
            </span>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Post type</span>
            <select
              name="postType"
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="STANDARD">Standard update</option>
              <option value="EVENT">Event (posts as a standard update for now)</option>
              <option value="OFFER">
                Offer (&quot;View offer&quot; links to the product)
              </option>
            </select>
          </label>
          {postType === "OFFER" && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                Coupon code (optional)
              </span>
              <input
                name="offerCoupon"
                defaultValue={cfg.offer_coupon ?? ""}
                placeholder="e.g. FALL10"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <span className="text-[10px] text-muted-foreground">
                Offers run for 7 days. Product posts link the offer to
                the product page; topic posts link to the website.
              </span>
            </label>
          )}
        </>
      )}

      {selectedDestination !== "local" && (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            name="autoPublish"
            defaultChecked={schedule?.autoPublish ?? false}
            className="mt-0.5 size-4 rounded border-white/20 bg-card/60"
          />
          <span>
            <span className="block font-medium">Auto-publish</span>
            <span className="block text-[10px] text-muted-foreground">
              Skip the review queue and publish directly each run. Keep
              this OFF until you trust the prompts.
              {selectedKind === "blog_draft" &&
                " (When OFF, posts land as WP drafts; when ON, as published.)"}
            </span>
          </span>
        </label>
      )}

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-cyan-500/15 px-5 text-sm font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Calendar className="mr-2 size-4" />
              {editing ? "Save changes" : "Create schedule"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {editing
          ? "Changes apply from the next run. Items already in the queue are kept."
          : "New schedules generate their first item on the next agent tick (≤24h, or click “Run now” on the row after saving)."}
      </p>
    </form>
  );
}

function ScheduleRow({
  schedule,
  clientId,
  onEdit,
}: {
  schedule: DailySchedule;
  clientId: number;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const meta = KIND_META[schedule.kind];
  const Icon = meta.icon;
  const cfg = (schedule.configJson ?? {}) as ScheduleConfig;

  return (
    <li className="glass-apple relative overflow-hidden rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Icon className={`size-5 shrink-0 ${meta.iconCls}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{meta.label}</span>
            {!schedule.enabled && (
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                paused
              </span>
            )}
            {schedule.autoPublish && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${meta.badge}`}
              >
                Auto-publish
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatCadence(schedule.cadenceDays)} at {formatTime(schedule.timeUtc)}
            {cfg.topic_seed && ` · "${cfg.topic_seed}"`}
            {schedule.lastRunAt && (
              <>
                {" · last run "}
                {new Date(schedule.lastRunAt).toLocaleString().slice(0, 16)}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await runScheduleNow(schedule.id, clientId);
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            })
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Play className="size-3" />
          )}
          Run now
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toggleScheduleEnabled(schedule.id, clientId);
            })
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
          title={schedule.enabled ? "Pause" : "Resume"}
        >
          {schedule.enabled ? (
            <>
              <PowerOff className="size-3" />
              Pause
            </>
          ) : (
            <>
              <Power className="size-3" />
              Resume
            </>
          )}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onEdit}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
          title="Edit this schedule"
        >
          <Pencil className="size-3" />
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await confirmDialog({
              title: "Delete this schedule?",
              description: "Already-generated queue items are kept; this just stops future runs.",
              confirmLabel: "Delete schedule",
              destructive: true,
            });
            if (!ok) return;
            startTransition(async () => {
              await deleteSchedule(schedule.id, clientId);
              toast.success("Schedule deleted.");
            });
          }}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5"
          title={expanded ? "Hide details" : "Show details"}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-muted-foreground space-y-1">
          {cfg.tone && (
            <div>
              <span className="text-foreground/80">Tone:</span> {cfg.tone}
            </div>
          )}
          {schedule.kind === "gbp_post" && (
            <div>
              <span className="text-foreground/80">Content:</span>{" "}
              {cfg.gbp_source === "woo_product" ? "Shop product" : "Topic post"}
              {" · "}
              <span className="text-foreground/80">Max length:</span>{" "}
              {cfg.max_chars ?? 300} chars
              {cfg.post_type === "OFFER" && (
                <>
                  {" · "}
                  <span className="text-foreground/80">Type:</span> Offer
                  {cfg.offer_coupon ? ` (coupon ${cfg.offer_coupon})` : ""}
                </>
              )}
            </div>
          )}
          {cfg.keywords_mode === "planner" && (
            <div>
              <span className="text-foreground/80">Keywords:</span> from Keyword
              Planner
            </div>
          )}
          {cfg.keywords_mode === "custom" && cfg.keywords_custom && (
            <div>
              <span className="text-foreground/80">Keywords:</span>{" "}
              {cfg.keywords_custom.join(", ")}
            </div>
          )}
          {(cfg.cta_type || cfg.button_text) && (
            <div>
              <span className="text-foreground/80">Button:</span>{" "}
              {cfg.button_text ?? cfg.cta_type}
            </div>
          )}
          {schedule.kind === "social_post" && cfg.social_source === "woo_product" && (
            <div>
              <span className="text-foreground/80">Post about:</span> Shop product
            </div>
          )}
          {schedule.kind === "blog_draft" && cfg.blog_source && (
            <div>
              <span className="text-foreground/80">Article about:</span>{" "}
              {cfg.blog_source === "woo_product"
                ? "One shop product"
                : cfg.blog_source === "woo_products"
                  ? "Product roundup (3)"
                  : "Topic"}
            </div>
          )}
          {cfg.gbp_location_name && (
            <div>
              <span className="text-foreground/80">GBP location:</span>{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5">
                {cfg.gbp_location_name}
              </code>
            </div>
          )}
          {cfg.post_type && (
            <div>
              <span className="text-foreground/80">Post type:</span>{" "}
              {cfg.post_type}
            </div>
          )}
          {schedule.nextRunAt && (
            <div>
              <span className="text-foreground/80">Next run:</span>{" "}
              {new Date(schedule.nextRunAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function DestinationRadio({
  value,
  title,
  description,
  active,
  disabled,
  onClick,
}: {
  value: Destination;
  title: string;
  description: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone =
    value === "local"
      ? "border-emerald-500/40 bg-emerald-500/[0.04]"
      : value === "wordpress"
        ? "border-violet-500/40 bg-violet-500/[0.04]"
        : "border-cyan-500/40 bg-cyan-500/[0.04]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? tone
          : "border-white/10 hover:bg-white/[0.03]"
      }`}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-[11px] text-muted-foreground">{description}</span>
    </button>
  );
}

