import { getStorage } from "@/lib/storage";
import { buildKey, guessMime } from "@/lib/uploads";
import { fail, isNextControlFlowError, json, newId, readJson } from "@/lib/http";

type InitBody = {
  name?: string;
  path?: string;
  size?: number;
  mime?: string;
  kind?: "file" | "text";
  note?: string;
  batchId?: string | null;
  folder?: string | null;
  /** Reuse a previous id so a retry overwrites instead of duplicating. */
  reuseId?: string | null;
};

const MAX_NAME_LENGTH = 400;

export async function POST(request: Request) {
  const body = await readJson<InitBody>(request);
  if (!body) return fail("Invalid request body.");

  const name = (body.name ?? "").toString().trim();
  if (!name) return fail("A file name is required.");
  if (name.length > MAX_NAME_LENGTH) return fail("That file name is too long.");

  const path = (body.path ?? name).toString() || name;
  const size = Number(body.size ?? 0);
  if (!Number.isFinite(size) || size < 0) return fail("Invalid file size.");

  const mime = (body.mime ?? "").toString() || guessMime(path);
  const reuseId = (body.reuseId ?? "").toString();
  const id = /^[a-z0-9]{8,64}$/i.test(reuseId) ? reuseId : newId();
  const key = buildKey(id, path);

  try {
    const storage = getStorage();
    const upload = await storage.createUploadUrl(
      key,
      mime,
      new URL(request.url).origin,
    );

    return json({
      id,
      key,
      url: upload.url,
      headers: upload.headers,
      mime,
    });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[POST /api/upload/init]", error);
    return fail("Could not prepare the upload.", 500);
  }
}
