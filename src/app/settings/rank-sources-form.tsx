"use client";

import { useActionState } from "react";
import { CheckCircle2, Loader2, Save, XCircle } from "lucide-react";
import {
  saveRankSources,
  type RankSourcesSettings,
  type RankSourcesState,
} from "./rank-sources-actions";

export function RankSourcesForm({ initial }: { initial: RankSourcesSettings }) {
  const [state, formAction, pending] = useActionState<
    RankSourcesState | null,
    FormData
  >(saveRankSources, null);

  return (
    <form action={formAction} className="space-y-6">
      {/*
        Leads with the thing that is true: for a site you own, none of
        the fields below beats connecting Search Console. Burying that
        under three optional integrations would be selling the
        complicated answer.
      */}
      <div className="rounded-lg bg-violet-500/10 px-3 py-2.5 text-xs ring-1 ring-inset ring-violet-500/25">
        <span className="font-medium text-violet-200">
          For sites you own, connect Search Console instead.
        </span>{" "}
        <span className="text-muted-foreground">
          It is Google&apos;s own impression-weighted position, free, covers
          every query you actually appear for, and cannot be rate-limited or
          blocked. Everything on this page is for the cases it cannot answer:
          competitors&apos; sites, and clients who have not connected it.{" "}
        </span>
        <a href="#google" className="font-medium underline underline-offset-2">
          Go to Google connections
        </a>
      </div>

      <Field
        label="SearXNG address"
        hint={
          <>
            An open-source metasearch engine you run yourself. It queries
            Google, Bing, Brave and others and merges the results, so it keeps
            working when any one of them blocks us — which, measured from this
            machine, is most of them. Free, no key, no browser.
            <br />
            <strong className="text-foreground/80">
              Run your own.
            </strong>{" "}
            Public instances rate-limit automated use within a few queries, and
            it is somebody&apos;s volunteer bandwidth. After starting it, add{" "}
            <code className="rounded bg-white/5 px-1">json</code> under{" "}
            <code className="rounded bg-white/5 px-1">search.formats</code> in
            its <code className="rounded bg-white/5 px-1">settings.yml</code> —
            JSON output is off by default and nothing works without it.
          </>
        }
      >
        <input
          name="searxngUrl"
          defaultValue={initial.searxngUrl}
          placeholder="http://localhost:8888"
          className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-violet-400/50"
        />
      </Field>

      <Field
        label="Brave Search API key"
        hint={
          <>
            Official API with a free tier. It searches Brave&apos;s own index,
            not Google&apos;s, so a page can sit far higher or lower here —
            readings are kept as their own series and never subtracted from a
            Search Console or Google number.{" "}
            {initial.braveKeySet ? (
              <span className="text-emerald-300">A key is saved.</span>
            ) : (
              <span>No key saved.</span>
            )}{" "}
            Leave blank to keep the current one.
          </>
        }
      >
        <input
          name="braveKey"
          type="password"
          autoComplete="off"
          placeholder={initial.braveKeySet ? "•••••••• (unchanged)" : "BSA…"}
          className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-violet-400/50"
        />
        {initial.braveKeySet && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="clearBraveKey" className="accent-rose-400" />
            Remove the saved key
          </label>
        )}
      </Field>

      <Field
        label="Attach to a Chrome you started"
        hint={
          <>
            Start Chrome yourself with{" "}
            <code className="rounded bg-white/5 px-1">
              --remote-debugging-port=9222
            </code>{" "}
            and put that address here. Rank checks then run in{" "}
            <em>your</em> browser — your profile, your cookies, your consent
            choices — instead of a fresh headless one that search engines
            recognise immediately.
            <br />
            <strong className="text-foreground/80">Three things to know.</strong>{" "}
            Anything able to reach that port can drive your browser, so it must
            be on this machine and is still a real exposure on a shared one. The
            tool acts as whoever is signed in. And closing Chrome stops rank
            checks until you start it again.
          </>
        }
      >
        <input
          name="cdpUrl"
          defaultValue={initial.cdpUrl}
          placeholder="http://127.0.0.1:9222"
          className="w-full rounded-md bg-white/5 px-3 py-2 text-sm ring-1 ring-inset ring-white/10 focus:outline-none focus:ring-violet-400/50"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-violet-500/20 px-3 py-1.5 text-sm font-medium text-violet-200 ring-1 ring-inset ring-violet-400/40 hover:bg-violet-500/30 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Save
        </button>
        {state?.ok && state.message && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
            <CheckCircle2 className="size-3.5" />
            {state.message}
          </span>
        )}
        {state && !state.ok && (
          <span className="inline-flex items-start gap-1.5 text-xs text-rose-300">
            <XCircle className="mt-0.5 size-3.5 shrink-0" />
            {state.error}
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Order used: Search Console, then SearXNG, then Brave, then a headless
        browser. A source that fails hands on to the next; a source that answers
        &ldquo;not in these results&rdquo; does not, because that is an answer.
      </p>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
