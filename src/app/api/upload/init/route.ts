import { getStorage } from "@/lib/storage";
import { guessMime } from "@/lib/uploads";
import { signUploadSession, verifyUploadSession } from "@/lib/secret";
import {
  fail,
  configurationErrorMessage,
  isNextControlFlowError,
  json,
  newId,
  readJson,
} from "@/lib/http";

type InitBody = {
  name?: string;
  path?: string;
  size?: number;
  mime?: string;
  kind?: "file" | "text";
  note?: string;
  folder?: string | null;
  /** Reuse a previous id so a retry overwrites instead of duplicating. */
  reuseId?: string | null;
  /** Proof that the caller is the one the id was handed out to. */
  session?: string | null;
};

const MAX_NAME_LENGTH = 400;
/** Vercel Blob allows 5 TB per object; anything larger is a client bug. */
const MAX_SIZE_BYTES = 5 * 1024 * 1024 * 1024 * 1024;
/** The Blob API refuses object keys longer than this. */
const MAX_KEY_LENGTH = 950;

/**
 * Mints the id and the object key, then tells the browser how to put the
 * bytes into the bucket.
 *
 * The file never passes through this function: the browser talks to the
 * storage backend directly.
 */
export async function POST(request: Request) {
  const body = await readJson<InitBody>(request);
  if (!body) return fail("Invalid request body.");

  const name = (body.name ?? "").toString().trim();
  if (!name) return fail("A file name is required.");
  if (name.length > MAX_NAME_LENGTH) return fail("That file name is too long.");

  const path = (body.path ?? name).toString() || name;
  const size = Number(body.size ?? 0);
  if (!Number.isFinite(size) || size < 0) return fail("Invalid file size.");
  if (size > MAX_SIZE_BYTES) return fail("That file is too large.");

  const mime = (body.mime ?? "").toString() || guessMime(path);
  const reuseId = (body.reuseId ?? "").toString();
  const session = (body.session ?? "").toString();

  // An id may only be reused by the browser it was handed out to, so a retry
  // overwrites its own object and nobody else's.
  const canReuse =
    /^[a-z0-9]{8,64}$/i.test(reuseId) && verifyUploadSession(reuseId, session);
  const id = canReuse ? reuseId : newId();

  try {
    const storage = getStorage();
    const key = storage.buildKey(id, path);
    if (key.length > MAX_KEY_LENGTH) {
      return fail("That path is too long for the bucket.");
    }

    const upload = await storage.createBrowserUpload(key, mime, {
      size,
      origin: new URL(request.url).origin,
    });

    return json({ id, key, session: signUploadSession(id), upload, mime });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[POST /api/upload/init]", error);
    const config = configurationErrorMessage(error);
    return fail(config ?? "Could not prepare the upload.", config ? 503 : 500);
  }
}
