#!/usr/bin/env node
/**
 * End-to-end smoke test.
 *
 * Runs the whole upload -> list -> download -> delete flow against a running
 * instance, so you can prove a deployment works without opening a browser.
 *
 *   npm run smoke                       # against http://localhost:3000
 *   BASE_URL=https://darkie.dpdns.org ADMIN_KEY=xxx npm run smoke
 */

const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const adminKey = process.env.ADMIN_KEY || "";

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
  check("init returned an upload url", typeof prepared.url === "string");
  check("init returned a key", typeof prepared.key === "string");

  console.log("\n3. put the bytes straight into the bucket");
  const putResponse = await fetch(prepared.url, {
    method: "PUT",
    headers: prepared.headers ?? { "Content-Type": "text/plain" },
    body,
  });
  check("direct upload succeeded", putResponse.ok, `status ${putResponse.status}`);

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

  console.log("");
  if (failures === 0) {
    console.log("all checks passed");
    process.exit(0);
  }
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}

main().catch((error) => {
  console.error("");
  console.error("smoke test crashed:", error);
  process.exit(1);
});
