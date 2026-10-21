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

Instead the files live in **Vercel Blob**, and the browser uploads them
**straight to the bucket**:

```
browser ──(1) POST /api/upload/init────▶ app server ──▶ mints the id and the key
browser ──(2) POST /api/upload/blob-token▶ app server ──▶ mints a client token
browser ──(3) PUT  <signed url>────────▶ Vercel Blob    ← the bytes never touch the app
browser ──(4) POST /api/upload/complete▶ app server ──▶ stores the note
```

Because the file never passes through a serverless function, **there is no
size limit in practice**. Anything above 16 MiB is uploaded in parts, so a slow
link cannot cut a big transfer in half.

### There is no index

Everything about an upload is encoded in its object key, so **one listing of
the bucket is the whole index**:

```
f/<id>/<original path>      the file itself
n/<id>/<base64url note>     the note attached to it
```

That has three useful consequences:

- **No read-modify-write.** There is no index file to race over, so two
  simultaneous uploads can never clobber each other.
- **Nothing can become invisible.** An upload shows up the moment its bytes
  land, even if the browser is closed before it reports back.
- **No stale reads.** Vercel Blob caches public reads through its CDN, which
  makes a classic "read the index, modify it, write it back" loop unsafe.
  Deriving the state from an immutable listing sidesteps that entirely.

The size, upload date and content type all come out of the listing as well, so
the only thing that needs a second object is the free-form note.

Resolving a single share link uses a **prefix listing** (`f/<id>/`), so it
costs two small requests instead of a full scan of the bucket.

### Why Vercel Blob and not R2

Both work. Vercel Blob is the default because **it needs no payment method**,
and R2 needs a card on file even though its free tier exists.

| | Vercel Blob | Cloudflare R2 | Git |
| --- | --- | --- | --- |
| Free storage | 1 GB/mo | 10 GB/mo | 1 GB soft limit |
| Max file size | 5 TB | 5 TiB | 100 MB |
| Egress | 10 GB free, then $0.05/GB | **free forever** | n/a |
| Payment method needed | **no** | yes | no |
| Setup | one CLI command | bucket + API token | none |
| Per GB beyond the free tier | $0.023 | $0.015 | free but bloats |

Switching backends is one environment variable. The R2 provider is still
implemented and tested; set `STORAGE_PROVIDER=r2` plus the four R2 variables
and redeploy.

---

## 1. Run it locally first (no cloud storage needed)

The app ships with a filesystem storage backend, so you can see the whole
thing working before touching any cloud account.

```bash
npm install
npm run dev
```

Open http://localhost:3000/anyupload/send. Uploads land in `.storage/` (git
ignored). The receive page shows a "local storage mode" badge so you know which
backend is live.

## 2. Create the Blob store (1 command, no card)

```bash
vercel blob create-store anyupload --access public --yes
```

That creates the store, connects it to the project and writes
`BLOB_READ_WRITE_TOKEN` into `.env.local`. Add `BLOB_STORE_ID` too (the CLI
prints the id, e.g. `store_cCJ07Z3CmJYF9DlS`) — it is what the public URL is
built from.

Then set `STORAGE_PROVIDER=blob` and pull the variables into your local
`.env.local`:

```bash
vercel env pull
```

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel login
vercel link
vercel env add BLOB_STORE_ID production
vercel env add ADMIN_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production
vercel --prod
```

Or push to GitHub and let Vercel build it — the repo is already connected, just
add the same environment variables in **Vercel → Project → Settings →
Environment Variables**.

`BLOB_READ_WRITE_TOKEN` is already set on the project by `create-store`.

## 4. Point darkie.dpdns.org at Vercel

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
check the status with `vercel domains inspect darkie.dpdns.org`.

> Proxy status must be **DNS only**. A proxied (orange cloud) record does not
> work with Vercel's domain verification.

Until the CNAME exists the name does not resolve at all.

### Deployment protection

The project uses Vercel's default `all_except_custom_domains` protection: the
`*.vercel.app` URL asks for a Vercel login, but **the custom domain is fully
public**. If you would rather have the `.vercel.app` URL public too, set
`ssoProtection` to `null` in the project settings.

---

## How it works, in detail

### Upload

1. `POST /api/upload/init` with `{ name, path, size, mime, kind, note }`. The
   server mints an id, builds the key `f/<id>/<original path>` and answers
   with the plan for the bytes: a presigned URL, or the Blob client.
2. The browser asks `POST /api/upload/blob-token` for a client token. The
   token is scoped to **exactly one object key**, so the write permission is
   as narrow as it can be.
3. The browser puts the bytes into the bucket. Small files go in one request,
   bigger ones are split into 8 MiB parts that travel in parallel and are
   retried individually.
4. `POST /api/upload/complete` confirms the bytes landed and stores the note as
   a second object keyed by the same id.

Three files at a time are uploaded in parallel. A failed transfer is retried
twice with a short backoff, and the browser can cancel a running upload.

### Download

- **Per file:** `/anyupload/file/<id>` resolves the upload and **redirects to
  the CDN**, so the bytes never travel through the app server. The link never
  expires and range requests work, so big downloads are resumable.
- **Grid cards:** `/api/uploads` returns the CDN url for each upload.
- **ZIP:** `POST /api/download` returns the urls for a set of ids; the browser
  streams them into a ZIP with [`client-zip`](https://github.com/Touffy/client-zip)
  without the files ever touching the server. Where the browser supports the
  File System Access API the archive is written straight to disk, otherwise it
  is buffered in memory first.

### Folders

Dropping a folder walks the directory tree with `webkitGetAsEntry` and uploads
each file with its relative path intact. "Choose a folder" uses
`<input webkitdirectory>`. Folder structure is preserved in the ZIP entry names
and shown on the cards.

### Files with no extension

Nothing special is needed. The browser reports `application/octet-stream` for
extensionless files, the type is stored as-is, and the name is preserved.

### Deleting

`DELETE /api/uploads/<id>` with the `x-admin-key` header. The receive page
prompts for the key once and keeps it in `localStorage`. With no `ADMIN_KEY`
set, deletion is disabled entirely.

### Retrying without duplicates

The id of an upload is what the object key is built from, so it doubles as the
write permission for that object. `/api/upload/init` hands out a signed
session with the id, and only the browser that asked for it may reuse that id
on a retry. A retry therefore overwrites its own object and nobody else's.

## Limits

| | |
| --- | --- |
| Single request upload | up to 5 GB |
| Multipart upload | up to ~80 GB (10 000 parts × 8 MiB) |
| Note length | 400 characters |
| Object key length | 950 characters (the Blob limit) |

Anything above the multipart threshold is uploaded in parts, so the practical
ceiling is the number of parts, not the size of a request.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/uploads` | list uploads with their CDN urls |
| `POST` | `/api/upload/init` | mint the id, the key and the upload plan |
| `POST` | `/api/upload/blob-token` | mint a client token for one object key |
| `POST` | `/api/upload/complete` | store the note for a finished upload |
| `POST` | `/api/download` | CDN urls for a set of ids (ZIP) |
| `DELETE` | `/api/uploads/:id` | delete an upload (needs `x-admin-key`) |
| `GET` | `/anyupload/file/:id` | permanent share link |

## Testing

```bash
npm run smoke                                        # against localhost:3000
BASE_URL=https://darkie.dpdns.org ADMIN_KEY=xxx npm run smoke
SMOKE_LARGE_MB=64 npm run smoke                      # also push a file in parts
```

It exercises the whole flow: upload, list, download through the share link and
delete, and fails loudly if any step breaks. `SMOKE_LARGE_MB` adds a file big
enough to be split into parts, which is the path that used to fall over.

## Troubleshooting

**"No storage backend is configured"**
The app refuses to fall back to local storage on Vercel (the filesystem is
read-only there) and says so instead of failing with a confusing error. Set
`STORAGE_PROVIDER=blob` and make sure `BLOB_READ_WRITE_TOKEN` and
`BLOB_STORE_ID` are set, then redeploy.

**Upload works locally but not on Vercel**
`NEXT_PUBLIC_SITE_URL` must be set in production.

**The upload fails with a CORS error**
The browser talks to `vercel.com/api/blob`, so the bucket has to allow the
origin. Run `vercel blob store` and check the CORS policy of the store.

**`darkie.dpdns.org` won't load**
The certificate has not been issued yet. That takes a few minutes after the
DNS records land. `vercel domains inspect darkie.dpdns.org` shows the status.

**A file downloads with a weird name**
The share link redirects to the CDN, which takes the name from the object
path. The original name is the last segment of that path, so it is preserved.
