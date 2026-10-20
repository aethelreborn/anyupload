import { NextResponse } from "next/server";

export function json<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Next.js signals "this data is only available at request time" by throwing a
 * control-flow error from inside a GET handler. If a try/catch swallows it the
 * route gets prerendered with whatever the catch returned, so those errors
 * have to be re-thrown untouched.
 */
export function isNextControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

export function isAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    // No admin key configured: deletion is disabled rather than open to anyone.
    return false;
  }
  const provided =
    request.headers.get("x-admin-key") ??
    new URL(request.url).searchParams.get("key") ??
    "";
  return provided.length > 0 && provided === expected;
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function siteUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (base) return `${base.replace(/\/$/, "")}${pathname}`;
  return pathname;
}
