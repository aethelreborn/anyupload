import { getStorage } from "@/lib/storage";
import { saveNote } from "@/lib/uploads";
import { verifyUploadSession } from "@/lib/secret";
import {
  fail,
  configurationErrorMessage,
  isNextControlFlowError,
  json,
  readJson,
} from "@/lib/http";

type CompleteRecord = {
  id?: string;
  key?: string;
  name?: string;
  path?: string;
  size?: number;
  mime?: string;
  kind?: "file" | "text";
  note?: string;
  folder?: string | null;
  /** Proof that this browser is the one the id was handed out to. */
  session?: string;
};

type CompleteBody = { records?: CompleteRecord[] } & CompleteRecord;

/**
 * Called after the browser has PUT the bytes straight into the bucket.
 *
 * The upload is already visible in the listing at this point, because the
 * listing is the index. This call only confirms the bytes landed and stores
 * the note that belongs to the upload.
 */
export async function POST(request: Request) {
  const body = await readJson<CompleteBody>(request);
  if (!body) return fail("Invalid request body.");

  const incoming: CompleteRecord[] = Array.isArray(body.records)
    ? body.records
    : [body];

  if (incoming.length === 0) return fail("No records to complete.");

  const storage = getStorage();
  const confirmed: Array<{ id: string; note: string }> = [];

  for (const item of incoming) {
    if (!item?.id || !item?.key) continue;

    // The id decides which object is written, so it is only honoured for the
    // browser that asked for it in the first place.
    if (!verifyUploadSession(item.id, item.session ?? "")) continue;

    const head = await storage.head(item.key);
    if (!head) {
      // The bytes never arrived, so there is nothing to record.
      continue;
    }

    confirmed.push({ id: item.id, note: (item.note ?? "").toString() });
  }

  if (confirmed.length === 0) {
    return fail("None of the uploaded files could be found in the bucket.", 409);
  }

  try {
    await Promise.all(confirmed.map((record) => saveNote(record.id, record.note)));
    return json({ ok: true, confirmed: confirmed.length });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[POST /api/upload/complete]", error);
    const config = configurationErrorMessage(error);
    return fail(config ?? "Could not record the upload.", config ? 503 : 500);
  }
}
