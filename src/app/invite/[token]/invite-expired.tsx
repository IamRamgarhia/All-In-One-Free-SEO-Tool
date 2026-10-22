"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InviteExpired({
  title,
  body,
  signInLabel,
}: {
  title: string;
  body: string;
  signInLabel: string;
}) {
  return (
    <>
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.03em]">
          {title}
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <Link
        href="/login"
        className={cn(buttonVariants({ size: "lg" }), "h-11 w-full")}
      >
        {signInLabel}
      </Link>
    </>
  );
}
