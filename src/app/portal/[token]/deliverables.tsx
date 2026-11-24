import { getTranslations } from "next-intl/server";
import { CheckCircle2, ExternalLink, FileText, Newspaper, Package, Receipt } from "lucide-react";
import type { OfferSnapshot } from "@/lib/service-offers";

type Accepted = { id: number; title: string; offers: OfferSnapshot[] };
type Report = { id: number; title: string; date: string };
type Post = { id: number; title: string; url: string; date: string | null };
type Bill = { id: number; number: string; status: "sent" | "paid" | "overdue" | string; date: string; total: string };

const STATUS_TONE: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30",
  sent: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
};

/**
 * Everything the agency has delivered to this client, whatever the
 * service: what they signed for, the reports, the published articles
 * and the invoices. One place, so the client never has to dig through
 * emails for a PDF.
 */
export async function Deliverables({
  token,
  accepted,
  reports,
  posts,
  invoices,
}: {
  token: string;
  accepted: Accepted[];
  reports: Report[];
  posts: Post[];
  invoices: Bill[];
}) {
  const t = await getTranslations("portal.deliverables");
  if (accepted.length + reports.length + posts.length + invoices.length === 0) return null;
  const base = `/portal/${token}`;

  return (
    <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
      <header className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
          <Package className="size-4 text-violet-700 dark:text-violet-300" />
        </div>
        <div>
          <h2 className="text-base font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
      </header>

      <div className="grid gap-6 p-5 md:grid-cols-2">
        {accepted.length > 0 && (
          <div className="space-y-3 md:col-span-2">
            <h3 className="text-sm font-semibold">{t("services")}</h3>
            {accepted.map((p) => (
              <div key={p.id} className="space-y-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{p.title}</div>
                  <a
                    href={`${base}/proposals/${p.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-violet-700 dark:text-violet-200 hover:underline"
                  >
                    <FileText className="size-3.5" />
                    {t("signedQuote")}
                  </a>
                </div>
                {p.offers.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {p.offers.map((o) => (
                      <div key={o.offerId} className="space-y-1.5">
                        <div className="text-sm font-medium">{o.name}</div>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {o.deliverables.map((d) => (
                            <li key={d} className="flex gap-1.5">
                              <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {reports.length > 0 && (
          <List title={t("reports")} icon={FileText}>
            {reports.map((r) => (
              <Row key={r.id} href={`${base}/reports/${r.id}/pdf`} label={r.title} meta={r.date} />
            ))}
          </List>
        )}

        {posts.length > 0 && (
          <List title={t("articles")} icon={Newspaper}>
            {posts.map((p) => (
              <Row key={p.id} href={p.url} label={p.title} meta={p.date} external />
            ))}
          </List>
        )}

        {invoices.length > 0 && (
          <List title={t("invoices")} icon={Receipt}>
            {invoices.map((i) => (
              <Row
                key={i.id}
                href={`${base}/invoices/${i.id}/pdf`}
                label={`${i.number} · ${i.total}`}
                meta={i.date}
                badge={
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_TONE[i.status] ?? ""}`}
                  >
                    {t(`invoiceStatus.${i.status}`)}
                  </span>
                }
              />
            ))}
          </List>
        )}
      </div>
    </section>
  );
}

function List({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-cyan-700 dark:text-cyan-300" />
        {title}
      </h3>
      <ul className="divide-y divide-white/5 rounded-xl border border-white/5">{children}</ul>
    </div>
  );
}

function Row({
  href,
  label,
  meta,
  external = false,
  badge,
}: {
  href: string;
  label: string;
  meta: string | null;
  external?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
        {label}
        {external && <ExternalLink className="ml-1 inline size-3 text-muted-foreground" />}
      </a>
      {badge}
      {meta && <span className="shrink-0 text-[11px] text-muted-foreground">{meta}</span>}
    </li>
  );
}
