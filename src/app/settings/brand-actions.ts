"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteSetting, setSetting } from "@/lib/settings-store";

export type BrandActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const brandSchema = z.object({
  name: z.string().trim().max(80).optional().or(z.literal("").transform(() => undefined)),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex like #6d49d6")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  logoDataUrl: z
    .string()
    .trim()
    .startsWith("data:image/")
    .max(500_000, "Logo too big — keep under ~350 KB")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function saveBrand(
  _prev: BrandActionResult | null,
  formData: FormData,
): Promise<BrandActionResult> {
  const raw = {
    name: formData.get("name") ?? "",
    color: formData.get("color") ?? "",
    logoDataUrl: formData.get("logoDataUrl") ?? "",
  };

  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  if (parsed.data.name !== undefined) {
    await setSetting("brand.name", parsed.data.name);
  } else {
    await deleteSetting("brand.name");
  }

  if (parsed.data.color !== undefined) {
    await setSetting("brand.color", parsed.data.color);
  } else {
    await deleteSetting("brand.color");
  }

  // Logo only updated if provided (can't unset by simply omitting — preserves existing)
  if (parsed.data.logoDataUrl !== undefined) {
    await setSetting("brand.logo_data_url", parsed.data.logoDataUrl);
  }

  revalidatePath("/settings");
  return { ok: true, message: "Brand saved." };
}

export async function clearLogo(): Promise<void> {
  await deleteSetting("brand.logo_data_url");
  revalidatePath("/settings");
}
