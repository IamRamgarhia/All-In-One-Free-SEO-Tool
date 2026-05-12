"use client";

import { useActionState, useRef, useState } from "react";
import {
  Save,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBrand, clearLogo, type BrandActionResult } from "./brand-actions";

export function BrandForm({
  initialName,
  initialColor,
  initialLogoDataUrl,
  initialTagline,
  initialWebsite,
  initialEmail,
  initialPhone,
  initialFooterText,
}: {
  initialName: string | null;
  initialColor: string | null;
  initialLogoDataUrl: string | null;
  initialTagline?: string | null;
  initialWebsite?: string | null;
  initialEmail?: string | null;
  initialPhone?: string | null;
  initialFooterText?: string | null;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [color, setColor] = useState(initialColor ?? "#6d49d6");
  const [logoDataUrl, setLogoDataUrl] = useState(initialLogoDataUrl ?? "");
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState<
    BrandActionResult | null,
    FormData
  >(saveBrand, null);

  const handleFile = async (file: File) => {
    setLogoErr(null);
    if (file.size > 500_000) {
      setLogoErr("Logo too big — keep under ~350 KB.");
      return;
    }
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/i.test(file.type)) {
      setLogoErr("Use PNG, JPEG, WebP, or SVG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setLogoDataUrl(result);
    };
    reader.onerror = () => setLogoErr("Couldn't read the file.");
    reader.readAsDataURL(file);
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="logoDataUrl" value={logoDataUrl} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="brand-name">Brand name</Label>
          <Input
            id="brand-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme SEO Co."
            maxLength={80}
          />
          <p className="text-[11px] text-muted-foreground">
            Shown on PDF report covers and the footer.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-color">Accent color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border border-white/10 bg-card/60"
              aria-label="Pick brand color"
            />
            <Input
              id="brand-color"
              name="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#6d49d6"
              maxLength={7}
              pattern="^#[0-9a-fA-F]{6}$"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Used for headings and highlights in PDF reports.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
          {logoDataUrl ? (
            <div className="flex items-center justify-between gap-4">
              <div className="rounded-lg bg-white/95 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoDataUrl}
                  alt="Brand logo preview"
                  className="max-h-12 max-w-[180px] object-contain"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs hover:bg-white/10"
                >
                  <Upload className="size-3" />
                  Replace
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setLogoDataUrl("");
                    await clearLogo();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/20 hover:bg-rose-500/20"
                >
                  <Trash2 className="size-3" />
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-muted-foreground hover:border-white/20 hover:bg-white/5 hover:text-foreground"
            >
              <ImageIcon className="size-4" />
              Click to upload PNG / JPG / WebP / SVG (max ~350 KB)
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {logoErr && (
            <p className="mt-2 text-xs text-rose-300">{logoErr}</p>
          )}
        </div>
      </div>

      {/* Contact + footer block. Optional fields that appear on
          invoice PDFs, the weekly digest email header, the client
          portal share page, and the monthly report cover. The
          tagline, in particular, lets agencies show "Your growth
          partner since 2018"-style copy where appropriate. */}
      <fieldset className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contact + footer (optional, used on invoices + emails)
        </legend>

        <div className="space-y-1.5">
          <Label htmlFor="brand-tagline">Tagline</Label>
          <Input
            id="brand-tagline"
            name="tagline"
            defaultValue={initialTagline ?? ""}
            placeholder="Your growth partner — SEO done right"
            maxLength={120}
          />
          <p className="text-[11px] text-muted-foreground">
            Sub-headline under the brand name on report covers.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="brand-email">Contact email</Label>
            <Input
              id="brand-email"
              name="email"
              type="email"
              defaultValue={initialEmail ?? ""}
              placeholder="hello@yourdomain.com"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand-phone">Phone</Label>
            <Input
              id="brand-phone"
              name="phone"
              defaultValue={initialPhone ?? ""}
              placeholder="+1 555 123 4567"
              maxLength={40}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-website">Website</Label>
          <Input
            id="brand-website"
            name="website"
            defaultValue={initialWebsite ?? ""}
            placeholder="https://yourdomain.com"
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="brand-footer">Footer text</Label>
          <Input
            id="brand-footer"
            name="footerText"
            defaultValue={initialFooterText ?? ""}
            placeholder="Acme SEO Co. · Registered in Delaware · EIN 12-3456789"
            maxLength={200}
          />
          <p className="text-[11px] text-muted-foreground">
            Single line shown in the bottom of invoices, the weekly
            digest email, and the client portal page. Good for
            registration info, address, or a tagline.
          </p>
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="shadow-md shadow-violet-500/20"
        >
          <Save className="size-4" />
          {pending ? "Saving…" : "Save brand"}
        </Button>
        {state && (
          <span
            className={
              state.ok
                ? "inline-flex items-center gap-1 text-xs text-emerald-300"
                : "inline-flex items-center gap-1 text-xs text-rose-300"
            }
          >
            {state.ok ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <AlertCircle className="size-3" />
            )}
            {state.ok ? state.message : state.error}
          </span>
        )}
      </div>
    </form>
  );
}
