import { getStorage } from "@/lib/storage";
import { addUploads, guessMime, type UploadKind } from "@/lib/uploads";
import { fail, isNextControlFlowError, json, readJson } from "@/lib/http";

type CompleteRecord = {
  id?: string;
  key?: string;
  name?: string;
  path?: string;
  size?: number;
  mime?: string;
  kind?: UploadKind;
  note?: string;
  batchId?: string | null;
  folder?: string | null;
};

type CompleteBody = { records?: CompleteRecord[] } & CompleteRecord;

/**
 * Called after the browser has PUT the bytes straight into the bucket.
 * Confirms the object really landed, then records it in the index.
 */
export async function POST(request: Request) {
  const body = await readJson<CompleteBody>(request);
  if (!body) return fail("Invalid request body.");

  const incoming: CompleteRecord[] = Array.isArray(body.records)
    ? body.records
    : [body];

  if (incoming.length === 0) return fail("No records to complete.");

  const storage = getStorage();
  const confirmed: Array<{
    id: string;
    name: string;
    path: string;
    size: number;
    mime: string;
    kind: UploadKind;
    note: string;
    batchId: string | null;
    folder: string | null;
  }> = [];

  for (const item of incoming) {
    if (!item?.id) continue;

    const path = (item.path ?? item.name ?? "").toString();
    if (!path) continue;

    const key = item.key ?? "";
    if (!key) continue;

    const head = await storage.head(key);
    if (!head) {
      // The bytes never arrived, so there is nothing to index.
      continue;
    }

    confirmed.push({
      id: item.id,
      name: (item.name ?? path.split("/").pop() ?? path).toString(),
      path,
      size: head.size,
      mime: (item.mime ?? "").toString() || guessMime(path),
      kind: item.kind === "text" ? "text" : "file",
      note: (item.note ?? "").toString().slice(0, 2000),
      batchId: item.batchId ?? null,
      folder: item.folder ?? null,
    });
  }

  if (confirmed.length === 0) {
    return fail("None of the uploaded files could be found in the bucket.", 409);
  }

  try {
    const added = await addUploads(confirmed);
    return json({ ok: true, uploads: added });
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    console.error("[POST /api/upload/complete]", error);
    return fail("Could not index the upload.", 500);
  }
}
