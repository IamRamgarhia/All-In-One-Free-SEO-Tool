"use server";

import { z } from "zod";
import { renderAndCapture, type RenderResult } from "@/lib/render-capture";
import { recordToolRun } from "@/lib/tool-findings";
import { renderFindings } from "@/lib/tool-finding-builders";

const inputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  device: z.enum(["mobile", "desktop"]).default("desktop"),
  waitUntil: z
    .enum(["domcontentloaded", "load", "networkidle"])
    .default("load"),
  fullPage: z.coerce.boolean().default(true),
  screenshot: z.coerce.boolean().default(true),
});

export type RenderState =
  | { ok: true; result: RenderResult }
  | { ok: false; error: string };

export async function runRender(
  _prev: RenderState | null,
  formData: FormData,
): Promise<RenderState> {
  const parsed = inputSchema.safeParse({
    url: formData.get("url"),
    device: formData.get("device") || "desktop",
    waitUntil: formData.get("waitUntil") || "load",
    fullPage: formData.get("fullPage") ?? "true",
    screenshot: formData.get("screenshot") ?? "true",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  try {
    const result = await renderAndCapture(parsed.data.url, {
      device: parsed.data.device,
      waitUntil: parsed.data.waitUntil,
      fullPage: parsed.data.fullPage,
      screenshot: parsed.data.screenshot,
    });
    if (!result.ok && result.error) return { ok: false, error: result.error };
    // Persist metadata only — screenshot can be very large
    await recordToolRun({
      toolId: "render",
      label: `${parsed.data.url} · ${parsed.data.device}`,
      input: {
        url: parsed.data.url,
        device: parsed.data.device,
        waitUntil: parsed.data.waitUntil,
      },
      result: {
        ok: true,
        finalUrl: result.finalUrl,
        renderedHtmlBytes: result.html?.length ?? 0,
        hasScreenshot: !!result.screenshot,
      },
      findings: renderFindings(result),
    });
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Render failed",
    };
  }
}
