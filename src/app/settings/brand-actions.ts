"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteSetting, setSetting } from "@/lib/settings-store";

export type BrandActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const emptyToUndefined = z.literal("").transform(() => undefined);

const brandSchema = z.object({
  name: z.string().trim().max(80).optional().or(emptyToUndefined),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex like #6d49d6")
    .optional()
    .or(emptyToUndefined),
  logoDataUrl: z
    .string()
    .trim()
    .startsWith("data:image/")
    .max(500_000, "Logo too big — keep under ~350 KB")
    .optional()
    .or(emptyToUndefined),
  tagline: z.string().trim().max(120).optional().or(emptyToUndefined),
  website: z.string().trim().max(200).optional().or(emptyToUndefined),
  email: z
    .string()
    .trim()
    .max(200)
    .email("Use a valid email like hello@yourdomain.com")
    .optional()
    .or(emptyToUndefined),
  phone: z.string().trim().max(40).optional().or(emptyToUndefined),
  footerText: z.string().trim().max(200).optional().or(emptyToUndefined),
});

export async function saveBrand(
  _prev: BrandActionResult | null,
  formData: FormData,
): Promise<BrandActionResult> {
  const raw = {
    name: formData.get("name") ?? "",
    color: formData.get("color") ?? "",
    logoDataUrl: formData.get("logoDataUrl") ?? "",
    tagline: formData.get("tagline") ?? "",
    website: formData.get("website") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    footerText: formData.get("footerText") ?? "",
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

  // Extended fields — set or unset based on presence
  const extended: [
    "brand.tagline" | "brand.website" | "brand.email" | "brand.phone" | "brand.footer_text",
    string | undefined,
  ][] = [
    ["brand.tagline", parsed.data.tagline],
    ["brand.website", parsed.data.website],
    ["brand.email", parsed.data.email],
    ["brand.phone", parsed.data.phone],
    ["brand.footer_text", parsed.data.footerText],
  ];
  for (const [key, value] of extended) {
    if (value !== undefined) {
      await setSetting(key, value);
    } else {
      await deleteSetting(key);
    }
  }

  revalidatePath("/settings");
  return { ok: true, message: "Brand saved." };
}

export async function clearLogo(): Promise<void> {
  await deleteSetting("brand.logo_data_url");
  revalidatePath("/settings");
}
