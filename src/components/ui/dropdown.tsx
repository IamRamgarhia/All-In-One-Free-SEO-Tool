"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * A menu that cannot be clipped by whatever it happens to sit inside.
 *
 * The app had three of these built from `<details>` with an
 * `absolute top-full` panel. Absolute positioning is clipped by any
 * scrolling ancestor, and every one of them lives inside
 * `main.flex-1.overflow-y-auto`. On a 900px-tall window the client
 * page's "Generate report" menu happened to fit with 32px to spare; at
 * 800px two of its three items were cut off, and at 720px — an ordinary
 * laptop window — all three were. The user saw a box with one word in it
 * and no way to reach the other two reports.
 *
 * Nothing errored, the markup was correct, and it passed review twice:
 * once as written, and once from me after I removed a *different*
 * clipping ancestor and measured only at the one viewport height where
 * it fit.
 *
 * So the panel is rendered into document.body and positioned with
 * `fixed`, which no ancestor's overflow can touch. It flips above the
 * trigger when there is not enough room below, and clamps to the
 * viewport so it can never open off-screen.
 *
 * Requires JS, which `<details>` did not. That is a real trade and worth
 * it: a menu that silently loses two thirds of its items is not working
 * either.
 */
export function Dropdown({
  trigger,
  children,
  align = "left",
  width = 240,
  className = "",
  panelClassName = "",
}: {
  /** The button's contents. The button chrome is supplied by `className`. */
  trigger: ReactNode;
  children: ReactNode;
  /** Which edge of the trigger the panel lines up with. */
  align?: "left" | "right";
  /** Panel width in px — needed up front to clamp against the viewport. */
  width?: number;
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const gap = 4;
    const panelH = panelRef.current?.offsetHeight ?? 0;
    const below = window.innerHeight - b.bottom - gap;
    // Flip up only when below genuinely cannot hold it AND above can do
    // better. Flipping into an even smaller space helps nobody.
    const flip = panelH > below && b.top - gap > below;
    const top = flip ? Math.max(gap, b.top - gap - panelH) : b.bottom + gap;
    const rawLeft = align === "right" ? b.right - width : b.left;
    const left = Math.min(
      Math.max(gap, rawLeft),
      Math.max(gap, window.innerWidth - width - gap),
    );
    setPos({ top, left });
  }, [align, width]);

  // Measure after the panel exists but before paint, so it never appears
  // at the wrong place for a frame.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    // Close on scroll rather than re-following: a fixed panel that stays
    // put while the page moves under it looks broken, and re-measuring on
    // every scroll frame is worse.
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        {trigger}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="menu"
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width,
              // Never taller than the screen; scroll inside instead of
              // running off the bottom.
              maxHeight: "calc(100vh - 16px)",
            }}
            className={`z-[60] overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-popover shadow-xl ${panelClassName}`}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
