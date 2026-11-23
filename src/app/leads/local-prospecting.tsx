"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Globe, Loader2, MapPin, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCAL_TRADES, type LocalBusiness } from "@/lib/prospect-search";
import { auditProspect, findProspectSite, searchProspects, type ProspectSearchState } from "./prospect-actions";

/**
 * Local prospecting: the businesses of one trade in one postcode, from the
 * French company register, each with its probable site and an express
 * audit that lands in the leads inbox below.
 */
export function LocalProspecting({ hasSerpApi }: { hasSerpApi: boolean }) {
  const t = useTranslations("leads.prospecting");
  const [state, formAction, pending] = useActionState<ProspectSearchState, FormData>(searchProspects, null);
  const [naf, setNaf] = useState(LOCAL_TRADES[0].naf);
  const [postcode, setPostcode] = useState("");

  return (
    <section className="glass-apple rounded-xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="size-4 text-emerald-300" />
        {t("title")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("intro")}</p>

      <form action={formAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <label className="sr-only" htmlFor="prospect-trade">
          {t("trade")}
        </label>
        <select
          id="prospect-trade"
          name="naf"
          value={naf}
          onChange={(e) => setNaf(e.target.value)}
          className="h-10 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
        >
          {LOCAL_TRADES.map((trade) => (
            <option key={trade.id} value={trade.naf}>
              {t(`trades.${trade.id}`)} ({trade.naf})
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="prospect-postcode">
          {t("postcode")}
        </label>
        <input
          id="prospect-postcode"
          name="postcode"
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          required
          value={postcode}
          onChange={(e) => setPostcode(e.target.value.replace(/\D/g, ""))}
          placeholder={t("postcodePlaceholder")}
          className="h-10 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
        />
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {t("search")}
        </Button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("legal")}</p>

      {state && !state.ok ? <p className="mt-3 text-sm text-rose-300">{state.error}</p> : null}

      {state?.ok ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("found", { shown: state.businesses.length, total: state.total })}
          </p>
          {state.businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="space-y-2">
              {state.businesses.map((b) => (
                <ProspectCard key={b.siret} business={b} hasSerpApi={hasSerpApi} />
              ))}
            </ul>
          )}
          {state.page < state.pages ? (
            <form action={formAction}>
              <input type="hidden" name="naf" value={naf} />
              <input type="hidden" name="postcode" value={postcode} />
              <input type="hidden" name="page" value={state.page + 1} />
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                {t("nextPage", { page: state.page + 1, pages: state.pages })}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProspectCard({ business, hasSerpApi }: { business: LocalBusiness; hasSerpApi: boolean }) {
  const t = useTranslations("leads.prospecting");
  const [site, setSite] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  return (
    <li className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words text-sm font-medium">{business.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {business.since ? t("since", { year: business.since }) : null}
        </p>
      </div>
      <p className="mt-0.5 break-words text-xs text-muted-foreground">{business.address}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`site-${business.siret}`}>
          {t("site")}
        </label>
        <input
          id={`site-${business.siret}`}
          value={site}
          onChange={(e) => setSite(e.target.value)}
          placeholder={t("sitePlaceholder")}
          className="h-9 min-w-0 flex-1 basis-48 rounded-md border border-white/10 bg-card/60 px-3 text-sm"
        />
        {hasSerpApi ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              start(async () => {
                setNote(null);
                const r = await findProspectSite(business.name, business.city);
                if (!r.ok) setNote({ ok: false, text: r.error });
                else if (r.url) setSite(r.url);
                else setNote({ ok: false, text: t("noSiteFound") });
              })
            }
          >
            <Globe className="size-3.5" />
            {t("findSite")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={busy || !site.trim()}
          onClick={() =>
            start(async () => {
              setNote(null);
              const r = await auditProspect({ url: site, business });
              setNote(
                r.ok
                  ? { ok: true, text: t("audited", { score: r.score, critical: r.critical, high: r.high }) }
                  : { ok: false, text: r.error },
              );
            })
          }
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {t("audit")}
        </Button>
      </div>
      {note ? (
        <p className={`mt-2 text-xs ${note.ok ? "text-emerald-300" : "text-amber-300"}`}>{note.text}</p>
      ) : null}
    </li>
  );
}
