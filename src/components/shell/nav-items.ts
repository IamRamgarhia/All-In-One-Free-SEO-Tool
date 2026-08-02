/**
 * Shared navigation data for the desktop sidebar AND the mobile drawer.
 *
 * The mobile drawer used to carry its own hardcoded list of 11 links —
 * out of ~226 routes, eight of them sharing a single generic icon — so
 * phone users could reach a tenth of the app, and the two lists were
 * free to drift apart with nothing to catch it. CLAUDE.md notes most
 * SEOs check rankings on a phone, which made that the wrong place to
 * cut corners.
 *
 * One definition, two renderers.
 */

import {
  Activity,
  Bot,
  Building,
  ClipboardList,
  FileDown,
  FileSignature,
  FileStack,
  FileText,
  Gauge,
  GitCompare,
  GitMerge,
  Globe,
  GraduationCap,
  History,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  Link2,
  ListChecks,
  MapPin,
  Megaphone,
  Network,
  Newspaper,
  Receipt,
  ScanText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  Wand2,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Items marked `guided: true` are visible in Guided mode (the default
   * for new users). Items without the flag are Pro-only — they still
   * exist and are reachable by direct URL or via /tools, but the
   * sidebar hides them so beginners aren't drowning in 80 leaf nodes.
   *
   * The "Show all tools" footer toggle flips ui.mode from guided to pro
   * (or back). Settings → UI mode is the explicit knob.
   */
  guided?: boolean;
};

export type NavGroup = {
  id: string;
  title: string;
  /** Pinned groups are always visible and not collapsible. */
  pinned?: boolean;
  /** Default-expanded if true; otherwise collapsed by default. */
  defaultOpen?: boolean;
  items: NavItem[];
};


export const NAV_GROUPS: NavGroup[] = [
  {
    id: "essentials",
    title: "Essentials",
    pinned: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, guided: true },
      { href: "/welcome", label: "Get started", icon: Sparkles, guided: true },
      { href: "/clients", label: "Clients", icon: Users, guided: true },
      { href: "/seo-chat", label: "SEO chat", icon: Bot, guided: true },
      { href: "/audits", label: "Audits", icon: ClipboardList, guided: true },
      { href: "/tasks", label: "Tasks", icon: ListChecks, guided: true },
      { href: "/tools", label: "All tools", icon: Wrench, guided: true },
      { href: "/reports", label: "Reports", icon: FileDown, guided: true },
    ],
  },
  {
    id: "everyday",
    title: "Everyday",
    defaultOpen: false,
    items: [
      { href: "/morning", label: "Morning briefing", icon: Activity, guided: true },
      { href: "/digest", label: "Weekly digest", icon: Send },
      { href: "/grader", label: "Instant audit", icon: Sparkles, guided: true },
      { href: "/leads", label: "Leads", icon: Inbox, guided: true },
      { href: "/agent", label: "AI agent", icon: Bot },
      // Guided, because "what is this thing doing to my sites while I'm
      // not looking" is a question a beginner needs answered more
      // urgently than an expert does — and the answer, including the
      // undo button, is on this page.
      { href: "/agent/autopilot", label: "Autopilot", icon: ShieldCheck, guided: true },
      { href: "/capacity", label: "Capacity", icon: Gauge },
      { href: "/activity", label: "Activity log", icon: History },
    ],
  },
  {
    id: "content",
    title: "Content",
    items: [
      { href: "/content", label: "Content overview", icon: FileText, guided: true },
      { href: "/content/calendar", label: "Content calendar", icon: FileText },
      { href: "/blog", label: "AI blog writer", icon: Wand2, guided: true },
      { href: "/content-decay", label: "Content health", icon: TrendingDown, guided: true },
      { href: "/title-tests", label: "Title A/B tests", icon: Wand2 },
      { href: "/meta-rewrite", label: "Meta rewrite batch", icon: Wand2 },
    ],
  },
  {
    id: "keywords",
    title: "Keywords & ranks",
    items: [
      { href: "/keywords", label: "Tracked keywords", icon: Search, guided: true },
      { href: "/cannibalization", label: "Cannibalization", icon: GitMerge },
      { href: "/cwv", label: "Core Web Vitals", icon: Gauge },
      { href: "/serp-scans", label: "SERP scans archive", icon: Globe },
    ],
  },
  {
    id: "paid-ads",
    title: "Paid ads",
    defaultOpen: true,
    items: [
      // The ⭐ marks this as the newest / most-recommended entry —
      // matches the same treatment on /tools and the per-client launcher.
      {
        href: "/tools/ads-funnel",
        label: "Ad Funnel Architect ⭐",
        icon: Megaphone,
      },
      { href: "/tools/branded-split", label: "Branded vs non-branded", icon: Target },
    ],
  },
  {
    id: "backlinks",
    title: "Backlinks & outreach",
    items: [
      { href: "/backlinks", label: "Backlinks", icon: Link2, guided: true },
      { href: "/link-building", label: "Link building", icon: Link2 },
      { href: "/outreach", label: "Outreach", icon: Send },
      { href: "/broken-links", label: "Broken links", icon: Link2 },
    ],
  },
  {
    id: "local",
    title: "Local SEO",
    items: [
      { href: "/gbp", label: "Google Business Profile", icon: Building, guided: true },
      { href: "/citations", label: "Citations", icon: MapPin },
      { href: "/local-rank", label: "Local rank tracker", icon: MapPin },
      { href: "/local-grid", label: "Local rank heatmap", icon: MapPin },
    ],
  },
  {
    id: "competitors",
    title: "Competitors & brand",
    items: [
      { href: "/competitors", label: "Competitors", icon: Network },
      { href: "/brand-monitor", label: "Brand visibility", icon: Network },
      { href: "/compare", label: "Site compare", icon: GitCompare },
    ],
  },
  {
    id: "ai-visibility",
    title: "AI visibility",
    items: [
      { href: "/ai-visibility", label: "AI visibility tracker", icon: Sparkles },
      { href: "/chats", label: "AI chat history", icon: Bot },
    ],
  },
  {
    id: "monitoring",
    title: "Monitoring + history",
    items: [
      { href: "/monitor", label: "Page monitor", icon: Activity },
      { href: "/snapshots", label: "Snapshots", icon: ImageIcon },
      { href: "/history", label: "Tool run history", icon: History },
      { href: "/algorithm-updates", label: "Algorithm updates", icon: History },
      { href: "/news", label: "SEO news", icon: Newspaper },
    ],
  },
  {
    id: "imports",
    title: "Imports",
    items: [
      { href: "/import", label: "Import (all sources)", icon: ScanText },
    ],
  },
  {
    id: "deliverables",
    title: "Deliverables",
    items: [
      { href: "/reports/batch", label: "Generate all reports", icon: FileStack, guided: true },
      { href: "/reports/archive", label: "Report archive", icon: FileDown },
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/proposals", label: "Proposals", icon: FileSignature, guided: true },
      { href: "/invoices", label: "Invoices", icon: Receipt },
    ],
  },
  {
    id: "account",
    title: "Account",
    pinned: true,
    items: [
      { href: "/settings", label: "Settings", icon: Settings, guided: true },
      { href: "/learn", label: "Learn", icon: GraduationCap, guided: true },
      { href: "/knowledge", label: "Knowledge hub", icon: GraduationCap },
    ],
  },
];

/** Every nav item, flattened — used by the mobile drawer's filter. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
