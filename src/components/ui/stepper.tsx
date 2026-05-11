/**
 * Animated stepper. Pure-CSS — no framer-motion dependency. Each step
 * shows its index, a status dot (pending/in-progress/done), title, and
 * a short description. The connecting line between steps fills as
 * progress advances. Server- or client-renderable.
 */

import Link from "next/link";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepperStep = {
  id: string;
  title: string;
  description?: string;
  href?: string;
  icon?: LucideIcon;
  status: "done" | "active" | "pending";
};

export function Stepper({
  steps,
  className,
}: {
  steps: StepperStep[];
  className?: string;
}) {
  return (
    <ol className={cn("space-y-0", className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const Icon = step.icon;
        const node = (
          <div className="flex gap-3 group">
            <div className="relative flex flex-col items-center">
              <div
                className={cn(
                  "z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                  step.status === "done" &&
                    "bg-primary text-primary-foreground",
                  step.status === "active" &&
                    "bg-primary/15 text-primary ring-2 ring-primary",
                  step.status === "pending" &&
                    "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
                )}
              >
                {step.status === "done" ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : Icon ? (
                  <Icon className="size-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "mt-1 w-px flex-1 transition-colors",
                    step.status === "done"
                      ? "bg-primary"
                      : "bg-border",
                  )}
                  style={{ minHeight: 28 }}
                />
              )}
            </div>
            <div className={cn("flex-1 pb-6", isLast && "pb-0")}>
              <div
                className={cn(
                  "text-[13px] font-medium transition-colors",
                  step.status === "pending"
                    ? "text-muted-foreground"
                    : "text-foreground",
                  step.status === "active" &&
                    "group-hover:text-primary",
                )}
              >
                {step.title}
              </div>
              {step.description && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              )}
              {step.status === "active" && step.href && (
                <Link
                  href={step.href}
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                >
                  Start →
                </Link>
              )}
            </div>
          </div>
        );
        return <li key={step.id}>{node}</li>;
      })}
    </ol>
  );
}
