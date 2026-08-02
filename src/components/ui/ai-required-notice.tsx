import { configuredProviders } from "@/lib/api-keys";
import { NeedsConnection } from "./needs-connection";

/**
 * Shown at the top of a tool that can't produce anything without a model.
 *
 * The defect this fixes is the one the original audit was about, still
 * present months later in a different form. `callAI` returns `null` on
 * every failure — no key, retired model, spend cap, network blip — and
 * 65 call sites handle it as `if (aiText) { ...enrich... }`. When it's
 * null they silently skip the enrichment. No error, no message, no
 * indication anything was supposed to happen.
 *
 * So on an install with no AI key, seventeen tools respond to a click by
 * doing nothing visible. The user concludes the tool is broken, which is
 * a fair reading.
 *
 * `ai-error.ts` and `AiFailureNotice` were built during the audit to fix
 * exactly this and were then never rendered anywhere — I checked, and
 * `AiFailureNotice` appears in zero pages. Rewriting 65 call sites to
 * use `callAIResult` is the thorough fix and a large, risky diff.
 *
 * This is the cheap one that solves the actual user problem: say it
 * BEFORE they click. A tool that explains it needs a three-minute free
 * key is in a completely different category from one that appears to be
 * broken.
 *
 * Renders nothing when a provider is configured, so it costs nothing
 * once set up.
 */
export async function AiRequiredNotice({
  /** What this specific tool can't do. Falls back to generic copy. */
  because,
}: {
  because?: string;
}) {
  let hasProvider = false;
  try {
    hasProvider = (await configuredProviders()).ids.length > 0;
  } catch {
    // If we can't tell, say nothing rather than nag someone who is
    // already set up.
    return null;
  }

  if (hasProvider) return null;

  return (
    <NeedsConnection
      id="ai"
      because={
        because ?? "This tool needs an AI provider to produce anything."
      }
    />
  );
}
