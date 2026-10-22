import Image from "next/image";
import { cn } from "@/lib/utils";

const mono = "font-mono tabular-nums";

/** Logo unique : &lt;global_rank/&gt;.io — une ligne, sans fond */
export function GlobalRankLogo({
  className,
  inverted = false,
  size = "md",
  asSvg = false,
}: {
  className?: string;
  inverted?: boolean;
  size?: "sm" | "md" | "lg";
  /** SVG lockup (évite tout retour à la ligne) */
  asSvg?: boolean;
}) {
  const line =
    size === "sm"
      ? "text-[10px] sm:text-[11px]"
      : size === "lg"
        ? "text-[14px] xl:text-[15px]"
        : "text-[12px] sm:text-[13px]";

  const bracket = inverted ? "text-sky-400/85" : "text-primary/90";
  const globalPart = inverted ? "text-white/50" : "text-muted-foreground";
  const rankPart = inverted ? "text-white" : "text-foreground";
  const tld = inverted ? "text-sky-400" : "text-primary";

  if (asSvg) {
    const width = size === "lg" ? 248 : size === "sm" ? 200 : 220;
    return (
      <Image
        src={inverted ? "/brand-global-rank-lockup-light.svg" : "/brand-global-rank-lockup.svg"}
        alt="global_rank.io"
        width={width}
        height={26}
        className={cn("h-[26px] w-auto max-w-[min(100%,248px)] shrink-0", className)}
        priority
      />
    );
  }

  return (
    <span
      className={cn(
        mono,
        line,
        "inline-flex min-w-max shrink-0 flex-nowrap items-baseline whitespace-nowrap leading-none select-none",
        className,
      )}
      aria-label="global_rank.io"
      spellCheck={false}
    >
      <span className={cn("shrink-0 font-normal", bracket)}>&lt;</span>
      <span className={cn("shrink-0 font-normal", globalPart)}>global</span>
      <span className={cn("shrink-0 font-bold", rankPart)}>_rank</span>
      <span className={cn("shrink-0 font-normal", bracket)}>/&gt;</span>
      <span className={cn("shrink-0 font-semibold", tld)}>.io</span>
    </span>
  );
}

/** @deprecated alias */
export const GlobalRankWordmark = GlobalRankLogo;
export const GlobalRankBrand = GlobalRankLogo;
