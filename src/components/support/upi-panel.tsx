"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { MAINTAINER, upiDeepLink } from "@/lib/maintainer";
import { upiNote } from "@/lib/supporters";

/**
 * A ladder from ₹100 to ₹1000. Rungs rather than a blank field alone:
 * an empty box asks the payer to decide what the work is worth, which
 * is a harder question than picking one of five. The custom field and
 * "Any" are still there for anyone who has a figure in mind.
 */
export const PRESET_AMOUNTS = [100, 250, 500, 750, 1000] as const;

/**
 * Pick an amount, scan the QR, pay. One implementation.
 *
 * This lived inside the support dialog, which meant the QR only existed
 * behind a button: a visitor to Support & about saw a payment section
 * with nothing to scan. Copying the markup onto the page would have left
 * two amount ladders and two note builders free to drift — the exact
 * pair this project keeps finding already drifted. So it moved here and
 * both callers render the same component.
 *
 * `embedded` drops the card chrome for a page that draws its own.
 *
 * Deliberately NOT imported by anything a client sees: the portal, PDF
 * reports and invoices go to people who pay the USER, and the
 * maintainer's tip jar has no business on them. support-surfaces.test.ts
 * fails the build if that ever slips — this file is under
 * components/support/, which that guard treats as off-limits there.
 */
export function UpiPanel({ embedded = false }: { embedded?: boolean }) {
  const [copied, setCopied] = useState(false);
  // Amount in INR. null = "any amount" — a UPI deep link without `am=`
  // lets the payer type the amount in their own app. Default to a low
  // rung since a preset is more inviting than a blank slate.
  const [amount, setAmount] = useState<number | null>(250);
  const [customAmount, setCustomAmount] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  // Optional, and the note works without it. A UPI payment arrives with
  // a reference number and whatever the payer's bank calls them, which
  // is often neither the name they use nor one worth putting on a
  // thank-you list. Typing it here is the only way it gets known.
  const [payerName, setPayerName] = useState("");

  const upi = MAINTAINER.upi;

  // Rebuilt whenever the amount or the name changes — the same string
  // the QR encodes, so a phone scan and "open in app" prefill alike.
  //
  // The note names the SOFTWARE, not the maintainer: it is the only
  // thing identifying the payment in a bank statement weeks later.
  // `upiNote` is the single source for it (supporters.test.ts covers the
  // sanitising and the 50-character cap).
  const deepLink = upiDeepLink({
    amount: amount ?? undefined,
    note: upiNote(payerName),
  });

  // Generated locally, never through an external QR service — the deep
  // link contains the payee and the amount, and handing that to a third
  // party for rendering would be an odd thing to do on a privacy-first
  // tool. Dark modules on a light field so camera contrast holds even
  // when the surrounding UI is dark.
  useEffect(() => {
    if (!deepLink) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(deepLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [deepLink]);

  if (!upi) return null;

  function copyUpi() {
    navigator.clipboard.writeText(upi).then(() => {
      setCopied(true);
      toast.success("UPI ID copied");
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function pickPreset(v: number) {
    setAmount(v);
    setCustomAmount("");
  }

  function pickCustom(raw: string) {
    setCustomAmount(raw);
    // Up to 6 digits (₹999,999) — UPI's own cap aside, this is sane.
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    setAmount(Number.isFinite(n) && n > 0 ? n : null);
  }

  return (
    <section
      className={
        embedded
          ? ""
          : "rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4"
      }
    >
      {!embedded && (
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
            <IndianRupee className="size-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">UPI (India)</h3>
            <p className="text-[10px] text-muted-foreground">
              Zero fees · instant · scan or tap
            </p>
          </div>
        </div>
      )}

      {/* Amount picker — 5 presets + custom */}
      <div className={`grid grid-cols-5 gap-1.5 ${embedded ? "" : "mt-3"}`}>
        {PRESET_AMOUNTS.map((v) => {
          const active = amount === v && customAmount === "";
          return (
            <button
              key={v}
              type="button"
              aria-pressed={active}
              onClick={() => pickPreset(v)}
              className={`h-9 rounded-md text-xs font-semibold transition-colors ${
                active
                  ? "bg-emerald-500/30 text-emerald-100 ring-1 ring-inset ring-emerald-400/60"
                  : "bg-white/[0.04] text-foreground/80 ring-1 ring-inset ring-white/10 hover:bg-white/[0.08]"
              }`}
            >
              ₹{v}
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
            ₹
          </span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Custom amount"
            aria-label="Custom amount in rupees"
            value={customAmount}
            onChange={(e) => pickCustom(e.target.value)}
            className="h-9 w-full rounded-md bg-white/[0.04] pl-6 pr-2 text-xs text-foreground ring-1 ring-inset ring-white/10 placeholder:text-muted-foreground focus:outline-none focus:ring-emerald-400/60"
          />
        </div>
        <button
          type="button"
          aria-pressed={amount === null}
          onClick={() => {
            setAmount(null);
            setCustomAmount("");
          }}
          className={`h-9 shrink-0 rounded-md px-3 text-[11px] font-medium transition-colors ${
            amount === null
              ? "bg-emerald-500/30 text-emerald-100 ring-1 ring-inset ring-emerald-400/60"
              : "bg-white/[0.04] text-foreground/80 ring-1 ring-inset ring-white/10 hover:bg-white/[0.08]"
          }`}
          title="Let the payer choose the amount in their UPI app"
        >
          Any
        </button>
      </div>

      <label className="mt-1.5 block">
        <span className="sr-only">Your name, for the thank-you list</span>
        <input
          type="text"
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          maxLength={40}
          placeholder="Your name (optional) — so I know who to thank"
          className="h-9 w-full rounded-md bg-white/[0.04] px-2.5 text-xs text-foreground ring-1 ring-inset ring-white/10 placeholder:text-muted-foreground focus:outline-none focus:ring-emerald-400/60"
        />
      </label>

      {/* Regenerates locally as the amount or the note changes. */}
      {qrDataUrl && (
        <div className="mt-3 flex items-center justify-center rounded-lg bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`UPI QR code${amount ? ` for ₹${amount}` : ""}`}
            width={200}
            height={200}
            className="size-[200px]"
          />
        </div>
      )}

      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Scan with any UPI app — GPay, PhonePe, Paytm, BHIM — and it pays{" "}
        <span className="font-semibold text-foreground/85">
          {amount ? `₹${amount}` : "any amount"}
        </span>{" "}
        to {MAINTAINER.name}. The note will read{" "}
        <span className="font-semibold text-foreground/85">
          {upiNote(payerName)}
        </span>
        .
      </p>

      {/* The id, for when a scan is not possible — a desktop browser
          cannot hand a upi:// link anywhere useful. */}
      <div className="mt-3 flex items-center gap-1.5">
        <code className="flex-1 truncate rounded-md bg-black/30 px-3 py-2 font-mono text-[11px] ring-1 ring-inset ring-white/5">
          {upi}
        </code>
        <button
          type="button"
          onClick={copyUpi}
          title="Copy UPI ID"
          aria-label="Copy UPI ID"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-white/5 text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-300" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>

      {deepLink && (
        <a
          href={deepLink}
          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
        >
          Open in UPI app (mobile)
        </a>
      )}
    </section>
  );
}
