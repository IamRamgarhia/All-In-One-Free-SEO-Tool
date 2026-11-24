"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * An inline script that must run before first paint (theme class on
 * <html>), without React's "Encountered a script tag while rendering
 * React component" warning.
 *
 * React only warns when it creates a <script> in the browser, which
 * happens when it renders the root layout itself instead of hydrating
 * the server HTML (a not-found page in development, for example). There
 * the script is useless anyway: the page is already painted with the
 * right theme. So the script is in the server HTML and kept while
 * hydrating (server snapshot: true), and never created by the browser
 * (client snapshot: false). After hydration React drops the element; it
 * has already run.
 *
 * `code` must be static text: it is written into the page unescaped.
 */
export function ThemeScript({ code }: { code: string }) {
  const fromServer = useSyncExternalStore(
    noop,
    () => false,
    () => true,
  );
  return fromServer ? <script dangerouslySetInnerHTML={{ __html: code }} /> : null;
}
