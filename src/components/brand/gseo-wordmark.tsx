import { cn } from "@/lib/utils";

/** Picto GSEO : courbe de positions (3 barres), pas de lettre S. */
export function GseoLogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-[18px]", className)}
    >
      <path
        d="M5 16V11 M9.5 16V8 M14 16V5 M18.5 16V9"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M4 16.5h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

export function GseoWordmark({
  className,
  inverted,
  showSubline,
  subline,
  size = "default",
}: {
  className?: string;
  inverted?: boolean;
  showSubline?: boolean;
  subline?: string;
  size?: "default" | "lg";
}) {
  const box = size === "lg" ? "size-11 rounded-[14px]" : "size-8 rounded-[10px]";
  const title = size === "lg" ? "text-xl" : "text-[15px]";
  const sub = size === "lg" ? "text-[11px]" : "text-[10px]";

  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center gap-2.5",
        className,
      )}
    >
      <span
        className={cn(
          "grid place-items-center shadow-sm",
          box,
          inverted
            ? "bg-white text-[#111721]"
            : "bg-primary text-primary-foreground",
        )}
      >
        <GseoLogoMark className={size === "lg" ? "size-[22px]" : "size-[17px]"} />
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-[-0.03em]",
            title,
            inverted ? "text-white" : "text-foreground",
          )}
        >
          GSEO
        </span>
        {showSubline && subline ? (
          <span
            className={cn(
              "mt-1 font-medium uppercase tracking-[0.16em]",
              sub,
              inverted ? "text-white/50" : "text-muted-foreground",
            )}
          >
            {subline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
