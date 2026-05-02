"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  Globe,
  Loader2,
  Wand2,
  CheckCircle2,
  AlertCircle,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSetupDialog } from "@/components/shell/google-setup-dialog";
import {
  createClient,
  fetchClientMetadata,
  updateClient,
  type CreateClientResult,
  type UpdateClientResult,
} from "../actions";

const niches = [
  { value: "", label: "Skip for now" },
  { value: "local", label: "Local — physical storefront / service area" },
  { value: "ecommerce", label: "E-commerce — selling products online" },
  { value: "saas", label: "SaaS / B2B" },
  { value: "blog", label: "Blog / Content site" },
  { value: "services", label: "Professional services" },
];

type FormState = {
  name: string;
  url: string;
  description: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  gbpUrl: string;
  facebook: string;
  twitter: string;
  instagram: string;
  linkedin: string;
  youtube: string;
  tiktok: string;
};

const emptyState: FormState = {
  name: "",
  url: "",
  description: "",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  gbpUrl: "",
  facebook: "",
  twitter: "",
  instagram: "",
  linkedin: "",
  youtube: "",
  tiktok: "",
};

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  credentialsSet: boolean;
  credentialsFromEnv: boolean;
  email: string | null;
};

export function NewClientForm({
  mode = "create",
  clientId,
  initialUrl,
  initialName,
  initialFields,
  googleStatus,
  googleClientId,
  googleHasSecret,
  googleRedirectUri,
}: {
  mode?: "create" | "update";
  clientId?: number;
  initialUrl?: string;
  initialName?: string;
  initialFields?: Partial<FormState>;
  googleStatus?: GoogleStatus;
  googleClientId?: string | null;
  googleHasSecret?: boolean;
  googleRedirectUri?: string;
} = {}) {
  const isEdit = mode === "update";
  const [state, formAction, pending] = useActionState<
    CreateClientResult | UpdateClientResult | null,
    FormData
  >(isEdit ? updateClient : createClient, null);
  const errors = state && !state.ok ? state.errors : {};
  const [googleDialogOpen, setGoogleDialogOpen] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(
    googleStatus?.configured ?? false,
  );
  const [googleEmail, setGoogleEmail] = useState<string | null>(
    googleStatus?.email ?? null,
  );

  const [fields, setFields] = useState<FormState>({
    ...emptyState,
    url: initialUrl ?? "",
    name: initialName ?? "",
    ...(initialFields ?? {}),
  });
  const [fetchPending, startFetch] = useTransition();
  const [fetchMessage, setFetchMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // When the URL field blurs, auto-fill silently if no fetch has run yet.
  // Saves the user a click — this is the "easiest path" wiring.
  function onUrlBlur() {
    const url = fields.url.trim();
    if (!url) return;
    if (fetchPending) return;
    if (fetchMessage?.tone === "success") return; // already done
    autoFill();
  }

  function autoFill() {
    const url = fields.url.trim();
    if (!url) {
      setFetchMessage({ tone: "error", text: "Enter a URL first." });
      return;
    }
    setFetchMessage(null);
    startFetch(async () => {
      const result = await fetchClientMetadata(url);
      if (!result.ok) {
        setFetchMessage({ tone: "error", text: result.error });
        return;
      }
      const m = result.metadata;
      const social = m.socialLinks ?? {};
      setFields((prev) => ({
        ...prev,
        // Don't overwrite values the user has already typed.
        name: prev.name || m.name || prev.name,
        url: m.url || prev.url,
        description: prev.description || m.description || "",
        logoUrl: prev.logoUrl || m.logoUrl || "",
        address: prev.address || m.address || "",
        phone: prev.phone || m.phone || "",
        email: prev.email || m.email || "",
        gbpUrl: prev.gbpUrl || m.gbpUrl || "",
        facebook: prev.facebook || social.facebook || "",
        twitter: prev.twitter || social.twitter || "",
        instagram: prev.instagram || social.instagram || "",
        linkedin: prev.linkedin || social.linkedin || "",
        youtube: prev.youtube || social.youtube || "",
        tiktok: prev.tiktok || social.tiktok || "",
      }));
      const filled = [
        m.name && "name",
        m.logoUrl && "logo",
        m.description && "description",
        m.address && "address",
        m.phone && "phone",
        m.email && "email",
        m.gbpUrl && "Google Business",
        Object.keys(social).length > 0 && "social links",
      ].filter(Boolean) as string[];
      setFetchMessage({
        tone: "success",
        text:
          filled.length > 0
            ? `Found ${filled.join(", ")}. Edit anything before saving.`
            : "Site loaded but we couldn't extract metadata. Fill the rest manually.",
      });
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      {isEdit && clientId && (
        <input type="hidden" name="id" value={clientId} />
      )}
      {/* Website + auto-fill */}
      <div className="space-y-1.5">
        <Label htmlFor="url">Website URL</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="url"
              name="url"
              placeholder="acmecoffee.com"
              value={fields.url}
              onChange={(e) => update("url", e.target.value)}
              onBlur={onUrlBlur}
              required
              className="pl-9"
              aria-invalid={Boolean(errors.url)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={autoFill}
            disabled={fetchPending || !fields.url.trim()}
            title="Fetch logo, name, address, social links from the website"
          >
            {fetchPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Fetching…
              </>
            ) : (
              <>
                <Wand2 className="size-4" />
                Auto-fill
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          We&apos;ll add https:// for you. Click <strong>Auto-fill</strong> to pull
          the logo, name, address, and social links straight from the site.
        </p>
        {errors.url && (
          <p className="text-xs text-destructive">{errors.url}</p>
        )}
        {fetchMessage && (
          <div
            className={`mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-xs ring-1 ring-inset ${
              fetchMessage.tone === "success"
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
            }`}
          >
            {fetchMessage.tone === "success" ? (
              <CheckCircle2 className="size-3.5 shrink-0" />
            ) : (
              <AlertCircle className="size-3.5 shrink-0" />
            )}
            <span>{fetchMessage.text}</span>
          </div>
        )}
      </div>

      {/* Identity preview (logo + name + niche) */}
      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <LogoPreview src={fields.logoUrl} />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Client name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Acme Coffee Co."
              value={fields.name}
              onChange={(e) => update("name", e.target.value)}
              required
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="niche">Niche</Label>
            <select
              id="niche"
              name="niche"
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {niches.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Drives the auto-generated task list. You can change this later.
            </p>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          rows={2}
          value={fields.description}
          onChange={(e) => update("description", e.target.value)}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Hidden field — logo url stays in form data */}
      <input type="hidden" name="logoUrl" value={fields.logoUrl} />

      {/* Contact + GBP */}
      <Section title="Contact & Google Business">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Address"
            name="address"
            value={fields.address}
            onChange={(v) => update("address", v)}
            placeholder="123 Main St, Springfield, IL"
          />
          <Field
            label="Phone"
            name="phone"
            value={fields.phone}
            onChange={(v) => update("phone", v)}
            placeholder="+1 555 555 1234"
          />
          <Field
            label="Contact email"
            name="email"
            type="email"
            value={fields.email}
            onChange={(v) => update("email", v)}
            placeholder="hello@acme.com"
          />
          <Field
            label="Google Business profile"
            name="gbpUrl"
            value={fields.gbpUrl}
            onChange={(v) => update("gbpUrl", v)}
            placeholder="maps.google.com/… or business name"
            hint="Paste the share link from Google Maps."
          />
        </div>
      </Section>

      {/* Social links */}
      <Section
        title="Social links"
        subtitle="Auto-filled from the homepage when present. Edit anything that's wrong."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Facebook"
            name="facebook"
            value={fields.facebook}
            onChange={(v) => update("facebook", v)}
            placeholder="facebook.com/acmecoffee"
          />
          <Field
            label="Instagram"
            name="instagram"
            value={fields.instagram}
            onChange={(v) => update("instagram", v)}
            placeholder="instagram.com/acmecoffee"
          />
          <Field
            label="X / Twitter"
            name="twitter"
            value={fields.twitter}
            onChange={(v) => update("twitter", v)}
            placeholder="x.com/acmecoffee"
          />
          <Field
            label="LinkedIn"
            name="linkedin"
            value={fields.linkedin}
            onChange={(v) => update("linkedin", v)}
            placeholder="linkedin.com/company/acme"
          />
          <Field
            label="YouTube"
            name="youtube"
            value={fields.youtube}
            onChange={(v) => update("youtube", v)}
            placeholder="youtube.com/@acme"
          />
          <Field
            label="TikTok"
            name="tiktok"
            value={fields.tiktok}
            onChange={(v) => update("tiktok", v)}
            placeholder="tiktok.com/@acme"
          />
        </div>
      </Section>

      {/* Google integration — opens inline popup, skippable; hidden in edit mode */}
      {!isEdit && (
      <Section
        title="Connect Google data (optional)"
        subtitle="Skippable. After saving, you'll pick the Search Console + GA4 property for this client from a dropdown. The Google account you connect here serves every client — you don't have to do this twice."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Bullet>Real keyword positions, clicks, impressions from Google itself.</Bullet>
          <Bullet>Quick-wins finder — keywords at positions 4-15, one tweak from page 1.</Bullet>
          <Bullet>Real organic traffic charts in PDF reports.</Bullet>
          <Bullet>Free forever — 25,000 GSC queries/day, 50,000 GA4/day.</Bullet>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={googleConnected ? "outline" : "default"}
            size="sm"
            onClick={() => setGoogleDialogOpen(true)}
          >
            <Plug className="size-3.5" />
            {googleConnected
              ? `Connected${googleEmail ? ` (${googleEmail})` : ""}`
              : "Connect Google"}
          </Button>
          {googleConnected && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
              <CheckCircle2 className="size-3.5" />
              Pick the property on this client&apos;s detail page after saving.
            </span>
          )}
        </div>
      </Section>
      )}

      {!isEdit && googleStatus && googleRedirectUri && (
        <GoogleSetupDialog
          open={googleDialogOpen}
          onClose={() => setGoogleDialogOpen(false)}
          initialStatus={googleStatus}
          redirectUri={googleRedirectUri}
          initialClientId={googleClientId ?? null}
          hasSecret={googleHasSecret ?? false}
          onConnected={(email) => {
            setGoogleConnected(true);
            setGoogleEmail(email);
          }}
        />
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? isEdit
              ? "Saving…"
              : "Adding…"
            : isEdit
              ? "Save changes"
              : "Add client"}
        </Button>
        <Link
          href={isEdit && clientId ? `/clients/${clientId}` : "/clients"}
          className="text-sm text-muted-foreground hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
      <span>{children}</span>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function LogoPreview({ src }: { src: string }) {
  if (!src) {
    return (
      <div className="flex size-20 items-center justify-center rounded-xl border border-dashed border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground/50">
        Logo
      </div>
    );
  }
  return (
    <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Site logo preview"
        className="max-h-full max-w-full object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}
