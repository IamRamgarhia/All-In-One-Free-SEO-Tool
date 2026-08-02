import { AiRequiredNotice } from "./ai-required-notice";

/**
 * A layout that puts "this needs an AI key" above a tool that can't work
 * without one.
 *
 * A layout rather than an edit to each page, for two reasons. Twelve of
 * the seventeen AI tools are client components and can't await a server
 * function at all. And a layout can't be forgotten — whoever adds the
 * eighteenth AI tool gets the notice by putting their page in the
 * folder, whereas a component you have to remember to render is one that
 * eventually isn't rendered.
 *
 * Renders nothing once a provider is configured.
 */
export default function AiToolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <AiRequiredNotice />
      {children}
    </div>
  );
}
