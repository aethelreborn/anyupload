import { getStorage } from "@/lib/storage";
import { listUploads } from "@/lib/uploads";
import { fail, json, readJson } from "@/lib/http";

type DownloadBody = {
  ids?: string[];
  inline?: boolean;
  expiresIn?: number;
};

/**
 * Returns fresh signed download URLs for the given upload ids.
 * The client uses these to stream several files into one ZIP.
 */
export async function POST(request: Request) {
  const body = await readJson<DownloadBody>(request);
  if (!body) return fail("Invalid request body.");

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  if (ids.length === 0) return fail("No ids supplied.");

  const wanted = new Set(ids);
  const records = await listUploads();
  const selected = records.filter((record) => wanted.has(record.id));

  const storage = getStorage();
  const origin = new URL(request.url).origin;
  const urls: Record<string, string> = {};
  await Promise.all(
    selected.map(async (record) => {
      urls[record.id] = await storage.createDownloadUrl(record.key, {
        inline: body.inline ?? false,
        expiresIn: body.expiresIn,
        filename: record.name,
        origin,
      });
    }),
  );

  return json({ urls });
}
