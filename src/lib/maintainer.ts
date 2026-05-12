/**
 * Maintainer credit — who built this self-hosted tool. Separate from
 * the white-label `brand.*` settings, which control what the user
 * shows to THEIR clients on reports + invoices. This module is the
 * "Built by ..." line that shows in app chrome (footer, settings,
 * /about) where a maintainer credit makes sense and doesn't break
 * white-label intent.
 *
 * Single source of truth so the values stay consistent across the
 * dashboard footer, settings page, /about, and PDF generated-by
 * credit. Override any of them via env vars when self-hosting under
 * a different identity.
 */

export const MAINTAINER = {
  name: process.env.MAINTAINER_NAME ?? "DiceCodes",
  /**
   * Public website — anchors the maintainer credit and gives users a
   * place to go that isn't a code host. Empty string hides the link.
   */
  website: process.env.MAINTAINER_WEBSITE ?? "https://dicecodes.com",
  /**
   * Public GitHub URL. Used for "Source", "Report a bug", "Star us"
   * style links. Empty string disables the GitHub link in the UI.
   */
  github: process.env.MAINTAINER_GITHUB ?? "https://github.com/IamRamgarhia/seo",
  /**
   * UPI handle for INR tips. The UI shows both raw and a deep link
   * (upi://pay?pa=...&pn=...&cu=INR) so any UPI app — GPay, PhonePe,
   * Paytm, BHIM — can scan or open it directly.
   *
   * Set to "" to hide the UPI card.
   */
  upi: process.env.MAINTAINER_UPI ?? "princeramgarhiaa-1@okaxis",
  /**
   * Buy Me A Coffee URL — international fallback for users who can't
   * pay via UPI. Empty string hides it.
   */
  bmc: process.env.MAINTAINER_BMC ?? "https://buymeacoffee.com/dicecodes",
  /**
   * Commercial-license contact. PolyForm Noncommercial allows free
   * self-hosting for personal/agency use but bars resale or paid SaaS
   * hosting; commercial users need a paid license — they email this.
   */
  contactEmail: process.env.MAINTAINER_EMAIL ?? "hello@dicecodes.com",
  /**
   * Optional tagline shown beneath the maintainer name.
   */
  tagline:
    process.env.MAINTAINER_TAGLINE ??
    "Free for self-hosting. No monthly bills. Built solo.",
} as const;

/**
 * Build a `upi://pay?...` deep link. Most UPI apps recognize this
 * and prefill the payee. Amount is optional — leaving it out lets
 * the user pick how much to tip.
 */
export function upiDeepLink(opts?: {
  amount?: number;
  note?: string;
}): string {
  if (!MAINTAINER.upi) return "";
  const params = new URLSearchParams({
    pa: MAINTAINER.upi,
    pn: MAINTAINER.name,
    cu: "INR",
  });
  if (opts?.amount) params.set("am", String(opts.amount));
  if (opts?.note) params.set("tn", opts.note.slice(0, 80));
  return `upi://pay?${params}`;
}
