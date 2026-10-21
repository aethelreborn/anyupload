import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { verifyLocalSignature } from "@/lib/storage/local";
import { guessMime } from "@/lib/mime";
import { fail, isNextControlFlowError } from "@/lib/http";

const STORAGE_ROOT = path.join(process.cwd(), ".storage");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const expires = Number(url.searchParams.get("exp"));
  const signature = url.searchParams.get("sig") ?? "";
  const name = url.searchParams.get("name") ?? "download";
  const disposition = url.searchParams.get("disposition") ?? "attachment";

  if (!key || !verifyLocalSignature(key, expires, signature)) {
    return fail("Invalid or expired download signature.", 403);
  }

  const resolved = path.resolve(STORAGE_ROOT, key);
  const root = path.resolve(STORAGE_ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return fail("Invalid storage key.", 400);
  }

  try {
    const info = await stat(resolved);
    const stream = Readable.toWeb(createReadStream(resolved)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": guessMime(name),
        "Content-Length": String(info.size),
        "Content-Disposition": `${disposition}; filename="${name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_")}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[GET /api/local/download]", error);
    return fail("File not found.", 404);
  }
}
