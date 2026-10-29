"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Save,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { RecentRuns } from "@/components/recent-runs";
import { savePersonSchema, type SaveState } from "./actions";
import type { ToolRun } from "@/db/schema";

type SocialLink = { id: string; url: string };

function nextId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export default function PersonSchemaPage() {
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgUrl, setOrgUrl] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [credentials, setCredentials] = useState("");
  const [knowsAbout, setKnowsAbout] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [alumniOf, setAlumniOf] = useState("");
  const [socials, setSocials] = useState<SocialLink[]>([
    { id: nextId(), url: "" },
  ]);
  const [copied, setCopied] = useState(false);

  function setSocialAt(id: string, url: string) {
    setSocials((s) => s.map((x) => (x.id === id ? { ...x, url } : x)));
  }
  function addSocial() {
    setSocials((s) => [...s, { id: nextId(), url: "" }]);
  }
  function removeSocial(id: string) {
    setSocials((s) => s.filter((x) => x.id !== id));
  }

  const jsonld = useMemo(() => {
    if (!name.trim()) return "";
    const sameAs = socials.map((s) => s.url.trim()).filter(Boolean);
    const knows = knowsAbout
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const credList = credentials
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    type Obj = Record<string, unknown>;
    const obj: Obj = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: name.trim(),
    };
    if (jobTitle.trim()) obj.jobTitle = jobTitle.trim();
    if (bio.trim()) obj.description = bio.trim();
    if (email.trim()) obj.email = email.trim();
    if (imageUrl.trim()) obj.image = imageUrl.trim();
    if (profileUrl.trim()) obj.url = profileUrl.trim();
    if (orgName.trim()) {
      const org: Obj = { "@type": "Organization", name: orgName.trim() };
      if (orgUrl.trim()) org.url = orgUrl.trim();
      obj.worksFor = org;
    }
    if (alumniOf.trim()) {
      obj.alumniOf = alumniOf
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((n) => ({ "@type": "EducationalOrganization", name: n }));
    }
    if (knows.length > 0) obj.knowsAbout = knows;
    if (credList.length > 0) {
      obj.hasCredential = credList.map((c) => ({
        "@type": "EducationalOccupationalCredential",
        name: c,
      }));
    }
    if (yearsExperience.trim()) {
      const yr = Number(yearsExperience);
      if (Number.isFinite(yr) && yr > 0) {
        obj.knowsLanguage = obj.knowsLanguage; // no-op
        // Encode years of experience as additionalProperty so it's still
        // schema-valid:
        obj.additionalProperty = [
          {
            "@type": "PropertyValue",
            name: "yearsOfExperience",
            value: yr,
          },
        ];
      }
    }
    if (sameAs.length > 0) obj.sameAs = sameAs;

    return JSON.stringify(obj, null, 2);
  }, [
    name,
    jobTitle,
    orgName,
    orgUrl,
    profileUrl,
    imageUrl,
    bio,
    email,
    credentials,
    knowsAbout,
    yearsExperience,
    alumniOf,
    socials,
  ]);

  const fullEmbed = useMemo(() => {
    if (!jsonld) return "";
    return `<script type="application/ld+json">\n${jsonld}\n</script>`;
  }, [jsonld]);

  function copy() {
    if (!fullEmbed) return;
    navigator.clipboard.writeText(fullEmbed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Simple completeness score for E-E-A-T signal strength
  const score = useMemo(() => {
    let s = 0;
    if (name.trim()) s += 10;
    if (jobTitle.trim()) s += 10;
    if (orgName.trim()) s += 10;
    if (bio.trim().length >= 30) s += 15;
    if (imageUrl.trim()) s += 10;
    if (profileUrl.trim()) s += 5;
    if (credentials.trim()) s += 10;
    if (knowsAbout.trim()) s += 10;
    if (alumniOf.trim()) s += 5;
    if (socials.filter((x) => x.url.trim()).length >= 2) s += 10;
    if (yearsExperience.trim()) s += 5;
    return s;
  }, [
    name,
    jobTitle,
    orgName,
    bio,
    imageUrl,
    profileUrl,
    credentials,
    knowsAbout,
    alumniOf,
    socials,
    yearsExperience,
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All tools
      </Link>

      <PageHeader
        title="Person schema generator"
        description="Person JSON-LD is now the top E-E-A-T author signal in 2026 — Google's AI Mode uses it for entity verification. Fill in author/expert details and copy the snippet straight into your <head>."
        icon={User}
        accent="violet"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,420px)]">
        <section className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Full name *"
              value={name}
              onChange={setName}
              placeholder="Jane Doe"
            />
            <Field
              label="Job title"
              value={jobTitle}
              onChange={setJobTitle}
              placeholder="Senior SEO Strategist"
            />
            <Field
              label="Organization name"
              value={orgName}
              onChange={setOrgName}
              placeholder="Dice Codes"
            />
            <Field
              label="Organization URL"
              value={orgUrl}
              onChange={setOrgUrl}
              placeholder="https://dicecodes.com"
            />
            <Field
              label="Author profile URL on your site"
              value={profileUrl}
              onChange={setProfileUrl}
              placeholder="https://dicecodes.com/team/jane"
            />
            <Field
              label="Headshot image URL"
              value={imageUrl}
              onChange={setImageUrl}
              placeholder="https://dicecodes.com/jane.jpg"
            />
          </div>
          <div className="space-y-1 text-xs">
            <span className="text-muted-foreground">Bio (1-3 sentences)</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="12 years building organic-search programs at series-B SaaS companies. Spoke at MozCon 2024."
              className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Public email (optional)"
              value={email}
              onChange={setEmail}
              placeholder="jane@dicecodes.com"
            />
            <Field
              label="Years of experience"
              value={yearsExperience}
              onChange={setYearsExperience}
              placeholder="12"
            />
            <Field
              label="Credentials (comma-separated)"
              value={credentials}
              onChange={setCredentials}
              placeholder="Google Analytics Certified, MS Marketing"
            />
            <Field
              label="Knows about (comma-separated topics)"
              value={knowsAbout}
              onChange={setKnowsAbout}
              placeholder="technical SEO, content strategy, schema markup"
            />
            <Field
              label="Alumni of (comma-separated)"
              value={alumniOf}
              onChange={setAlumniOf}
              placeholder="Stanford University"
            />
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Social profile URLs (sameAs) — Twitter / LinkedIn / GitHub /
                Wikipedia
              </span>
              <button
                type="button"
                onClick={addSocial}
                className="text-[11px] text-violet-300 hover:underline"
              >
                + Add another
              </button>
            </div>
            {socials.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <input
                  value={s.url}
                  onChange={(e) => setSocialAt(s.id, e.target.value)}
                  placeholder="https://twitter.com/username"
                  className="h-9 flex-1 rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                {socials.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSocial(s.id)}
                    className="text-[11px] text-muted-foreground hover:text-rose-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          <div
            className={`rounded-2xl border p-5 ${
              score >= 75
                ? "border-emerald-500/30 bg-emerald-500/5"
                : score >= 50
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              E-E-A-T completeness
            </div>
            <div
              className={`mt-1 text-3xl font-semibold tabular-nums ${
                score >= 75
                  ? "text-emerald-300"
                  : score >= 50
                    ? "text-amber-300"
                    : "text-rose-300"
              }`}
            >
              {score}/100
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {score >= 75
                ? "Strong E-E-A-T signal. Google's AI Mode will use this to verify the author entity."
                : score >= 50
                  ? "Decent. Add more sameAs links + credentials to push past the threshold for AI citation."
                  : "Bare minimum. Add bio, image, ≥2 sameAs links, and credentials to make this meaningful."}
            </p>
          </div>

          <div className="rounded-2xl border border-white/5 bg-card/40 p-4 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground/90">2026 best practice</p>
            <ul className="mt-1.5 space-y-1 list-disc pl-4">
              <li>Embed inside the article&apos;s Article schema as <code className="rounded bg-white/5 px-1">author</code>.</li>
              <li>Use the SAME Person across all articles by the same author.</li>
              <li>The author bio page on your site should link out to all sameAs URLs.</li>
              <li>Wikipedia / Crunchbase / industry award URLs in sameAs strongly boost ChatGPT citation rate.</li>
            </ul>
          </div>
        </aside>
      </div>

      {jsonld && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">JSON-LD output</h2>
            <div className="flex flex-wrap items-center gap-2">
              <SaveButton name={name} jsonld={jsonld} />
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
              >
                <Copy className="size-3" />
                {copied ? "Copied" : "Copy <script>"}
              </button>
            </div>
          </header>
          <pre className="overflow-x-auto p-5 font-mono text-[12px] leading-relaxed text-foreground/90">
            {fullEmbed}
          </pre>
        </section>
      )}

      <PersonSchemaHistory
        onRestore={(run) => {
          const r = run.resultJson as { jsonld?: string } | null;
          if (r?.jsonld) {
            try {
              const parsed = JSON.parse(r.jsonld) as Record<string, unknown>;
              if (typeof parsed.name === "string") setName(parsed.name);
              if (typeof parsed.jobTitle === "string") setJobTitle(parsed.jobTitle);
              if (typeof parsed.description === "string") setBio(parsed.description);
              if (typeof parsed.email === "string") setEmail(parsed.email);
              if (typeof parsed.image === "string") setImageUrl(parsed.image);
              if (typeof parsed.url === "string") setProfileUrl(parsed.url);
              if (Array.isArray(parsed.sameAs)) {
                setSocials(
                  (parsed.sameAs as unknown[])
                    .map((u) => String(u))
                    .map((url) => ({ id: nextId(), url })),
                );
              }
            } catch {
              // ignore
            }
          }
        }}
      />
    </div>
  );
}

function SaveButton({ name, jsonld }: { name: string; jsonld: string }) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    savePersonSchema,
    null,
  );
  const disabled = !name.trim() || !jsonld;
  return (
    <form action={formAction}>
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="jsonld" value={jsonld} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex h-8 items-center gap-1 rounded-md bg-violet-500/15 px-3 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : state?.ok ? (
          <CheckCircle2 className="size-3" />
        ) : (
          <Save className="size-3" />
        )}
        {state?.ok ? "Saved" : "Save"}
      </button>
    </form>
  );
}

function PersonSchemaHistory({
  onRestore,
}: {
  onRestore: (run: ToolRun) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setRefreshKey((k) => k + 1), 30_000);
    return () => clearInterval(i);
  }, []);
  return (
    <RecentRuns
      toolId="person-schema"
      onRestore={onRestore}
      refreshKey={refreshKey}
    />
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
    </label>
  );
}
