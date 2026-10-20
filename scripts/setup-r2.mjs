#!/usr/bin/env node
/**
 * One-shot Cloudflare R2 bootstrap.
 *
 *   1. creates the bucket (if it does not exist yet)
 *   2. installs the CORS policy the browser needs for direct uploads
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx R2_ACCOUNT_ID=xxx R2_BUCKET_NAME=anyupload \
 *     node scripts/setup-r2.mjs
 *
 * The API token needs the "Workers R2 Storage: Edit" permission.
 * The R2 S3 keys (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) are NOT used here,
 * they are only for the app itself.
 */

const API = "https://api.cloudflare.com/client/v4";

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET_NAME || "anyupload";
const siteOrigin = process.env.SITE_ORIGIN || "https://darkie.dpdns.org";

if (!token || !accountId) {
  console.error(
    [
      "Missing configuration.",
      "",
      "  CLOUDFLARE_API_TOKEN  an account API token with 'Workers R2 Storage: Edit'",
      "  R2_ACCOUNT_ID         from the Cloudflare dashboard sidebar",
      "",
      "Optional:",
      "  R2_BUCKET_NAME        bucket to create (default: anyupload)",
      "  SITE_ORIGIN           origin allowed by CORS (default: https://darkie.dpdns.org)",
    ].join("\n"),
  );
  process.exit(1);
}

async function call(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { success: false, errors: [{ message: text }] };
  }

  if (!response.ok || payload.success === false) {
    const detail = (payload.errors || [])
      .map((error) => error.message)
      .join("; ");
    throw new Error(`${method} ${path} -> ${response.status}: ${detail || text}`);
  }

  return payload.result;
}

const corsRules = {
  rules: [
    {
      id: "anyupload-browser",
      allowed: {
        origins: [siteOrigin, "http://localhost:3000"],
        methods: ["GET", "PUT", "HEAD"],
        headers: ["*"],
      },
      exposeHeaders: ["ETag", "Content-Length", "Content-Type"],
      maxAgeSeconds: 3600,
    },
  ],
};

async function main() {
  console.log(`Account : ${accountId}`);
  console.log(`Bucket  : ${bucket}`);
  console.log(`Origin  : ${siteOrigin}`);
  console.log("");

  const existing = await call("GET", `/accounts/${accountId}/r2/buckets`);
  const found = (existing.buckets || []).some((b) => b.name === bucket);

  if (found) {
    console.log(`✓ bucket "${bucket}" already exists`);
  } else {
    await call("POST", `/accounts/${accountId}/r2/buckets`, { name: bucket });
    console.log(`✓ created bucket "${bucket}"`);
  }

  await call("PUT", `/accounts/${accountId}/r2/buckets/${bucket}/cors`, corsRules);
  console.log(`✓ installed CORS policy`);

  console.log("");
  console.log("Next: put these in .env.local and in the Vercel project settings.");
  console.log("");
  console.log("  R2_ACCOUNT_ID=" + accountId);
  console.log("  R2_BUCKET_NAME=" + bucket);
  console.log("  R2_ACCESS_KEY_ID=<from R2 -> Manage R2 API Tokens>");
  console.log("  R2_SECRET_ACCESS_KEY=<from R2 -> Manage R2 API Tokens>");
  console.log("  STORAGE_PROVIDER=r2");
}

main().catch((error) => {
  console.error("");
  console.error("Setup failed:", error.message);
  console.error("");
  console.error("Manual fallback:");
  console.error("  1. R2 -> Create bucket ->", bucket);
  console.error("  2. R2 -> bucket -> Settings -> CORS Policy -> Add CORS policy -> JSON:");
  console.error(JSON.stringify(corsRules.rules, null, 2));
  process.exit(1);
});
