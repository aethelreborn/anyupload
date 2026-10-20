import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyLocalSignature } from "@/lib/storage/local";
import { fail, isNextControlFlowError } from "@/lib/http";

const STORAGE_ROOT = path.join(process.cwd(), ".storage");

/**
 * Development-only upload endpoint. It exists so the app can be run without
 * R2 credentials; the R2 provider uses real presigned URLs instead.
 */
export async function PUT(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const expires = Number(url.searchParams.get("exp"));
  const signature = url.searchParams.get("sig") ?? "";

  if (!key || !verifyLocalSignature(key, expires, signature)) {
    return fail("Invalid or expired upload signature.", 403);
  }

  const resolved = path.resolve(STORAGE_ROOT, key);
  const root = path.resolve(STORAGE_ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return fail("Invalid storage key.", 400);
  }

  try {
    const body = Buffer.from(await request.arrayBuffer());
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, body);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[PUT /api/local/upload]", error);
    return fail("Could not write the file.", 500);
  }
}
