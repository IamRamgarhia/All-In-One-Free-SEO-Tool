import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { db } from "@/db/client";
import { serpScreenshots } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const sid = Number(id);
  if (!Number.isFinite(sid) || sid <= 0) {
    return new NextResponse("Bad id", { status: 400 });
  }

  const [row] = await db
    .select({ filePath: serpScreenshots.filePath })
    .from(serpScreenshots)
    .where(eq(serpScreenshots.id, sid))
    .limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await readFile(row.filePath);
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }

  // @ts-expect-error - Buffer is valid BodyInit at runtime
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
