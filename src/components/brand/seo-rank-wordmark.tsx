import { cn } from "@/lib/utils";

const mono = "font-mono tracking-tight";

/** Favicon / sidebar : balise mini autour de _r */
export function SeoRankLogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-px text-[10px] font-semibold leading-none",
        className,
      )}
      aria-hidden
    >
      <span className="opacity-70">&lt;</span>
      <span>_r</span>
      <span className="opacity-70">/&gt;</span>
    </span>
  );
}

export function SeoRankWordmark({
  className,
  inverted = false,
  size = "md",
  showDomain = false,
  domain = "seo-rank.io",
}: {
  className?: string;
  inverted?: boolean;
  size?: "sm" | "md" | "lg";
  /** Affiche l’URL enregistrable sous la balise */
  showDomain?: boolean;
  domain?: string;
}) {
  const text =
    size === "sm" ? "text-[13px]" : size === "lg" ? "text-[22px]" : "text-[15px]";
  const domainText =
    size === "sm" ? "text-[9px]" : size === "lg" ? "text-[11px]" : "text-[10px]";

  const bracket = inverted ? "text-sky-400/90" : "text-primary";
  const name = inverted ? "text-white" : "text-foreground";
  const seoPart = inverted ? "text-white/45" : "text-muted-foreground";
  const rankPart = inverted ? "text-white" : "text-foreground";
  const tld = inverted ? "text-sky-400" : "text-primary";

  return (
    <span
      className={cn("inline-flex flex-col gap-1 select-none", className)}
      aria-label="seo_rank"
    >
      <span className={cn(mono, text, "leading-none")}>
        <span className={cn("font-medium", bracket)}>&lt;</span>
        <span className={cn("font-medium", seoPart)}>seo</span>
        <span className={cn("font-bold", rankPart)}>_rank</span>
        <span className={cn("font-medium", bracket)}>/&gt;</span>
        <span className={cn("font-bold", tld)}>.io</span>
      </span>
      {showDomain ? (
        <span
          className={cn(
            mono,
            domainText,
            "font-medium uppercase tracking-[0.14em]",
            inverted ? "text-white/40" : "text-muted-foreground",
          )}
        >
          {domain}
        </span>
      ) : null}
    </span>
  );
}

/** Picto carré + wordmark (header login / sidebar) */
export function SeoRankBrand({
  className,
  inverted = false,
  size = "md",
  showDomain = false,
}: {
  className?: string;
  inverted?: boolean;
  size?: "sm" | "md" | "lg";
  showDomain?: boolean;
}) {
  const box =
    size === "sm" ? "size-8 rounded-[10px] text-[10px]" : size === "lg" ? "size-11 rounded-[14px] text-[11px]" : "size-9 rounded-[11px] text-[10px]";

  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "grid shrink-0 place-items-center shadow-sm",
          box,
          inverted
            ? "bg-white text-[#111721]"
            : "bg-primary text-primary-foreground",
        )}
      >
        <SeoRankLogoMark />
      </span>
      <SeoRankWordmark
        inverted={inverted}
        size={size}
        showDomain={showDomain}
      />
    </span>
  );
}
