# anyupload

Send a file from one device, pick it up on another. Built for the case where
you found something on the lab machine and want it on your laptop tonight.

- **https://darkie.dpdns.org/anyupload/send** — upload files, folders or text
- **https://darkie.dpdns.org/anyupload/receive** — grid of everything sent

`/anyupload/recieve` redirects to `/anyupload/receive`, so the misspelled URL
still works.

---

## How the files are stored

**They are not in Git, and they are not on the Vercel server.** Both would
break:

| Option | Why it fails |
| --- | --- |
| Git repo | 100 MB hard cap per file, every upload is a commit, the repo bloats and clones crawl |
| Vercel filesystem | Serverless functions have a read-only filesystem and a **4.5 MB request body limit** (hard, every plan) |

Instead the files live in **Cloudflare R2**, and the browser uploads them
**straight to the bucket**:

```
browser ──(1) POST /api/upload/init──▶ app server ──▶ mints a presigned PUT URL
browser ──(2) PUT  <presigned url>────▶ Cloudflare R2   ← the bytes never touch the app
browser ──(3) POST /api/upload/complete▶ app server ──▶ records it in the index
```

Because the file never passes through a serverless function, **there is no
size limit in practice** (R2 accepts objects up to 5 TiB; single-part uploads
up to 5 GiB).

### Bucket layout

```
f/<uploadId>/<percent-encoded-original-path>   the file itself
meta/index.json                                the metadata index
```

The original path is encoded into the object key, so a dropped folder keeps its
structure and the name survives even if the index is lost.

`meta/index.json` is a convenience cache, not the source of truth. It is
written with an atomic `If-Match` conditional put (R2 evaluates those
atomically), so two simultaneous uploads can never clobber each other. On every
page load the app reconciles the index against the bucket: objects that are
missing from the index are **recovered**, and index entries whose object is
gone are **dropped**. Nothing can become invisible.

### Why R2

| | Vercel Blob | Cloudflare R2 | Git |
| --- | --- | --- | --- |
| Free storage | 1 GB/mo | **10 GB/mo** | 1 GB soft limit |
| Max file size | 5 TB | **5 TiB** | 100 MB |
| Egress | 10 GB free, then $0.05/GB | **free forever** | n/a |
| Extra account needed | no | yes (you have one) | no |
| Per-file cost | $0.023/GB | $0.015/GB | free but bloats |

R2 wins on storage, on egress (this site exists to move files around) and on
max file size. The only downside is that it needs a bucket set up first.

---

## 1. Run it locally first (no R2 needed)

The app ships with a filesystem storage backend, so you can see the whole thing
working before touching Cloudflare.

```bash
npm install
npm run dev
```

Open http://localhost:3000/anyupload/send. Uploads land in `.storage/` (git
ignored). The receive page shows a "local storage mode" badge so you know which
backend is live.

## 2. Create the R2 bucket

1. Cloudflare dashboard → **R2** → **Create bucket** → name it `anyupload`.
2. **R2** → **Manage R2 API Tokens** → **Create Account API token**
   - permission: **Object Read & Write**
   - scope: this account
   - copy the **Access Key ID** and **Secret Access Key** — they are shown once
3. Copy your **Account ID** from the R2 overview page (right sidebar).

Or let the script do steps 1 and 4 for you. Create an account API token with
**Workers R2 Storage: Edit** at
<https://dash.cloudflare.com/profile/api-tokens>, then:

```bash
CLOUDFLARE_API_TOKEN=xxx R2_ACCOUNT_ID=xxx R2_BUCKET_NAME=anyupload \
  SITE_ORIGIN=https://darkie.dpdns.org npm run r2:setup
```

The script creates the bucket and installs the CORS policy. **CORS is not
optional** — without it the browser blocks the upload and you get an opaque
network error. It allows `GET`, `PUT` and `HEAD` from
`https://darkie.dpdns.org` and `http://localhost:3000`.

<details>
<summary>Manual CORS (dashboard)</summary>

R2 → your bucket → **Settings** → **CORS Policy** → **Add CORS policy** →
JSON tab:

```json
[
  {
    "AllowedOrigins": [
      "https://darkie.dpdns.org",
      "https://anyupload.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

</details>

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | yes | from the R2 API token |
| `R2_SECRET_ACCESS_KEY` | yes | from the R2 API token |
| `R2_BUCKET_NAME` | yes | `anyupload` |
| `STORAGE_PROVIDER` | no | `r2` or `local`. Auto-detected when unset |
| `ADMIN_KEY` | no | key required to delete uploads. Deletion is **disabled** when unset |
| `NEXT_PUBLIC_SITE_URL` | yes in prod | `https://darkie.dpdns.org` |

Then restart `npm run dev` and confirm the receive page no longer shows the
"local storage mode" badge.

## 4. Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel link          # pick/create the project
vercel env add R2_ACCOUNT_ID production
vercel env add R2_ACCESS_KEY_ID production
vercel env add R2_SECRET_ACCESS_KEY production
vercel env add R2_BUCKET_NAME production
vercel env add ADMIN_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production
vercel --prod
```

Or push to GitHub and let Vercel build it — the repo is already connected, just
add the same environment variables in **Vercel → Project → Settings →
Environment Variables**.

## 5. Point darkie.dpdns.org at Vercel

`darkie.dpdns.org` is delegated to Cloudflare's nameservers
(`gemma.ns.cloudflare.com`), so the DNS records are added in the **Cloudflare
dashboard** → Websites → `darkie.dpdns.org` → DNS → Add record.

The domain is already attached to the Vercel project. Two records are needed:

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| CNAME | `darkie` | `cname.vercel-dns.com` | **DNS only** (grey cloud) |
| TXT | `_vercel` | `vc-domain-verify=darkie.dpdns.org,608c9bfae28017eebbcb` | n/a |

The TXT record proves you own the domain. The CNAME is what actually routes
traffic. Vercel issues the certificate automatically once both are in place;
check the status at
`vercel domains inspect darkie.dpdns.org` or in the Vercel dashboard.

> Proxy status must be **DNS only**. A proxied (orange cloud) record does not
> work with Vercel's domain verification.

Until the CNAME exists the name does not resolve at all, so nothing works
until it is added.

### Deployment protection

The project uses Vercel's default `all_except_custom_domains` protection: the
`*.vercel.app` URL asks for a Vercel login, but **the custom domain is fully
public**. If you would rather have the `.vercel.app` URL public too, set
`ssoProtection` to `null` in the project settings.

---

## How it works, in detail

### Upload

1. `POST /api/upload/init` with `{ name, path, size, mime, kind, note, folder }`.
   The server mints an id, builds the key `f/<id>/<encoded path>` and returns a
   presigned PUT URL plus the exact `Content-Type` header to send.
2. The browser `PUT`s the raw bytes to that URL with `XMLHttpRequest` (the only
   browser API that reports upload progress).
3. `POST /api/upload/complete` with the metadata. The server `HeadObject`s the
   key to confirm the bytes landed and to record the real size, then appends to
   the index.

Three files at a time are uploaded in parallel.

### Download

- **Per file:** `/anyupload/file/<id>` mints a fresh presigned GET URL and
  redirects to it. The link never expires.
- **Grid cards:** `/api/uploads` returns a presigned download URL and a
  presigned inline preview URL per upload. Presigning is pure local HMAC
  computation, so listing 1000 uploads costs no extra network calls.
- **ZIP:** `POST /api/download` returns presigned URLs for a set of ids; the
  browser streams them into a ZIP with [`client-zip`](https://github.com/Touffy/client-zip)
  without the files ever touching the server. The files are fetched lazily,
  one at a time, so a hundred files do not mean a hundred open connections.

### Folders

Dropping a folder walks the directory tree with `webkitGetAsEntry` and uploads
each file with its relative path intact. "Choose a folder" uses
`<input webkitdirectory>`. Folder structure is preserved in the ZIP entry names
and shown on the cards.

### Files with no extension

Nothing special is needed. The browser reports `application/octet-stream` for
extensionless files, the type is stored as-is, and the name is preserved in the
object key.

### Deleting

`DELETE /api/uploads/<id>` with the `x-admin-key` header. The receive page
prompts for the key once and keeps it in `localStorage`. With no `ADMIN_KEY`
set, deletion is disabled entirely.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/uploads` | list uploads with signed URLs |
| `POST` | `/api/upload/init` | presigned PUT URL for a new upload |
| `POST` | `/api/upload/complete` | record finished uploads in the index |
| `POST` | `/api/download` | presigned GET URLs for a set of ids (ZIP) |
| `DELETE` | `/api/uploads/:id` | delete an upload (needs `x-admin-key`) |
| `GET` | `/anyupload/file/:id` | permanent share link, redirects to the file |

## Troubleshooting

**"Upload failed with status 403"**
The bucket CORS policy is missing or does not include your origin. Re-run
`npm run r2:setup`, or edit the policy in the dashboard. Remember to include
`http://localhost:3000` while developing.

**"Cloudflare R2 is not configured"**
The R2 environment variables are not set on the deployment. The app refuses to
fall back to local storage on Vercel (the filesystem is read-only there) and
says so instead of failing with a confusing error. Add the four variables and
redeploy.

**"Upload failed with status 400 / SignatureDoesNotMatch"**
The `Content-Type` sent by the browser does not match the one that was signed.
If you changed how the type is derived, update both sides. The
`requestChecksumCalculation: "WHEN_REQUIRED"` setting in
`src/lib/storage/r2.ts` also matters — without it the AWS SDK adds a checksum
the browser cannot reproduce and every upload fails.

**"Missing R2 configuration"**
The app fell back to local storage because the env vars are not set. Check
`.env.local` and restart the dev server.

**Upload works locally but not on Vercel**
`NEXT_PUBLIC_SITE_URL` must be set in production, and your origin
(`https://darkie.dpdns.org`) must be in the bucket CORS policy.

**`FUNCTION_PAYLOAD_TOO_LARGE`**
A file is being routed through the app server instead of the bucket. The
browser should never send file bytes to `/api/*` — only the small JSON metadata
payloads.
