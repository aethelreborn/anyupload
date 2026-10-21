#!/usr/bin/env node
/**
 * End-to-end smoke test.
 *
 * Runs the whole upload -> list -> download -> delete flow against a running
 * instance, so you can prove a deployment works without opening a browser.
 *
 *   npm run smoke                       # against http://localhost:3000
 *   BASE_URL=https://darkie.dpdns.org ADMIN_KEY=xxx npm run smoke
 *
 * Set SMOKE_LARGE_MB=64 to also push a file big enough to be split into
 * parts, which is the path that used to fall over on big uploads.
 */

import { Readable } from "node:stream";

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const adminKey = process.env.ADMIN_KEY || "";
const largeMb = Number(process.env.SMOKE_LARGE_MB || 0);

let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`anyupload smoke test against ${base}\n`);

  const name = `smoke-${Date.now()}.txt`;
  const body = `anyupload smoke test ${new Date().toISOString()}\n`;
  const note = "written by the smoke test";

  console.log("1. list uploads");
  const listResponse = await fetch(`${base}/api/uploads`, { cache: "no-store" });
  check("GET /api/uploads responds 200", listResponse.ok, `status ${listResponse.status}`);
  const list = await listResponse.json();
  check("response has an uploads array", Array.isArray(list.uploads));
  check("storage backend reported", typeof list.storage === "string", String(list.storage));

  console.log("\n2. prepare an upload");
  const initResponse = await fetch(`${base}/api/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      path: name,
      size: Buffer.byteLength(body),
      mime: "text/plain",
      kind: "text",
      note,
    }),
  });
  check("POST /api/upload/init responds 200", initResponse.ok, `status ${initResponse.status}`);
  const prepared = await initResponse.json();
  check("init returned an id", typeof prepared.id === "string");
  check("init returned a key", typeof prepared.key === "string");
  check(
    "init returned an upload plan",
    typeof prepared.upload === "object" && typeof prepared.upload.kind === "string",
    JSON.stringify(prepared.upload),
  );

  console.log("\n3. put the bytes straight into the bucket");
  await sendBytes(prepared, body);

  console.log("\n4. record the upload");
  const completeResponse = await fetch(`${base}/api/upload/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: prepared.id,
      key: prepared.key,
      name,
      path: name,
      size: Buffer.byteLength(body),
      mime: "text/plain",
      kind: "text",
      note,
      session: prepared.session,
    }),
  });
  check("POST /api/upload/complete responds 200", completeResponse.ok, `status ${completeResponse.status}`);

  console.log("\n5. confirm it shows up in the grid");
  const afterList = await (
    await fetch(`${base}/api/uploads`, { cache: "no-store" })
  ).json();
  const record = afterList.uploads.find((upload) => upload.id === prepared.id);
  check("upload is listed", Boolean(record));
  check("name survived", record?.name === name, record?.name);
  check("size is right", record?.size === Buffer.byteLength(body), String(record?.size));
  check("note survived", record?.note === note, record?.note);
  check("download url present", typeof record?.downloadUrl === "string");

  console.log("\n6. download it back through the share link");
  const shareResponse = await fetch(`${base}/anyupload/file/${prepared.id}`, {
    redirect: "follow",
  });
  check("share link responds 200", shareResponse.ok, `status ${shareResponse.status}`);
  const downloaded = await shareResponse.text();
  check("content matches", downloaded === body, JSON.stringify(downloaded.slice(0, 80)));

  console.log("\n7. delete it");
  if (adminKey) {
    const deleteResponse = await fetch(`${base}/api/uploads/${prepared.id}`, {
      method: "DELETE",
      headers: { "x-admin-key": adminKey },
    });
    check("DELETE responds 200", deleteResponse.ok, `status ${deleteResponse.status}`);

    const finalList = await (
      await fetch(`${base}/api/uploads`, { cache: "no-store" })
    ).json();
    check(
      "upload is gone",
      !finalList.uploads.some((upload) => upload.id === prepared.id),
    );
  } else {
    console.log("  skip no ADMIN_KEY set, deletion was not exercised");
  }

  if (largeMb > 0) {
    await largeUploadTest(largeMb);
  }

  console.log("");
  if (failures === 0) {
    console.log("all checks passed");
    process.exit(0);
  }
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}

/**
 * Sends the bytes the way the browser does: either straight to the presigned
 * URL, or through the official Blob client for the backends that use it.
 */
async function sendBytes(prepared, body) {
  const plan = prepared.upload;

  if (plan.kind === "vercel-blob") {
    const { upload } = await import("@vercel/blob/client");
    const result = await upload(prepared.key, body, {
      access: "public",
      handleUploadUrl: `${base}${plan.handleUploadUrl}`,
      multipart: plan.multipart === true,
    });
    check("blob client upload succeeded", Boolean(result.url), result.url);
    return;
  }

  const putResponse = await fetch(plan.url, {
    method: "PUT",
    headers: plan.headers ?? { "Content-Type": "text/plain" },
    body,
  });
  check("direct upload succeeded", putResponse.ok, `status ${putResponse.status}`);
}

/**
 * Pushes a file big enough to be uploaded in parts. This is the path that
 * used to die on big uploads.
 */
async function largeUploadTest(sizeMb) {
  console.log(`\n8. upload a ${sizeMb} MiB file (multipart path)`);
  const name = `smoke-large-${Date.now()}.bin`;
  const size = sizeMb * 1024 * 1024;

  const initResponse = await fetch(`${base}/api/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      path: name,
      size,
      mime: "application/octet-stream",
      kind: "file",
    }),
  });
  const prepared = await initResponse.json();
  check(
    "large upload is split into parts",
    prepared.upload?.multipart === true || prepared.upload?.kind === "presigned",
    JSON.stringify(prepared.upload),
  );

  const chunk = Buffer.alloc(1024 * 1024, 9);
  let sent = 0;
  const body = new Readable({
    read() {
      if (sent >= size) {
        this.push(null);
        return;
      }
      const length = Math.min(chunk.length, size - sent);
      sent += length;
      this.push(chunk.subarray(0, length));
    },
  });

  const started = Date.now();
  if (prepared.upload.kind === "vercel-blob") {
    const { upload } = await import("@vercel/blob/client");
    await upload(prepared.key, body, {
      access: "public",
      handleUploadUrl: `${base}${prepared.upload.handleUploadUrl}`,
      multipart: true,
    });
  } else {
    const response = await fetch(prepared.upload.url, {
      method: "PUT",
      headers: prepared.upload.headers ?? {},
      body,
      duplex: "half",
    });
    check("large direct upload succeeded", response.ok, `status ${response.status}`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`  ..  transferred ${sizeMb} MiB in ${seconds}s`);

  const afterList = await (
    await fetch(`${base}/api/uploads`, { cache: "no-store" })
  ).json();
  const record = afterList.uploads.find((upload) => upload.id === prepared.id);
  check("large upload is listed", Boolean(record));
  check("large upload has the right size", record?.size === size, String(record?.size));

  const head = await fetch(record.downloadUrl, {
    headers: { Range: "bytes=0-0" },
  });
  check("large upload is downloadable", head.ok, `status ${head.status}`);
  check(
    "large upload reports its length",
    head.headers.get("content-range") === `bytes 0-0/${size}`,
    head.headers.get("content-range") ?? "missing",
  );

  if (adminKey) {
    await fetch(`${base}/api/uploads/${prepared.id}`, {
      method: "DELETE",
      headers: { "x-admin-key": adminKey },
    });
    console.log("  ..  cleaned up");
  }
}

main().catch((error) => {
  console.error("");
  console.error("smoke test crashed:", error);
  process.exit(1);
});
