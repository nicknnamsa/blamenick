// Admin sign-in. The password lives in the ADMIN_PASSWORD secret (never in
// the repo). Signing in sets a cookie holding an expiry time plus an HMAC of
// it keyed by the password, so changing the password signs everyone out.

import { json } from "./visitors.js";

const COOKIE = "bn_admin";
const WEEK = 7 * 24 * 3600;
const enc = new TextEncoder();

async function hmac(password, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compare digests, not raw strings, so the check takes the same time either way.
async function sameText(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(x, y);
}

function cookieValue(request) {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? match[1] : "";
}

export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const [expiry, sig] = cookieValue(request).split(".");
  if (!expiry || !sig || Number(expiry) < Date.now() / 1000) return false;
  return sameText(sig, await hmac(env.ADMIN_PASSWORD, expiry));
}

export async function login(request, env) {
  if (!env.ADMIN_PASSWORD) return json({ error: "No admin password is set." }, 503);
  let password = "";
  try {
    ({ password = "" } = await request.json());
  } catch {}

  if (typeof password !== "string" || !(await sameText(password, env.ADMIN_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: "Wrong password." }, 401);
  }

  const expiry = String(Math.floor(Date.now() / 1000) + WEEK);
  const value = `${expiry}.${await hmac(env.ADMIN_PASSWORD, expiry)}`;
  return json({ ok: true }, 200, {
    "set-cookie": `${COOKIE}=${value}; Path=/api/admin; Max-Age=${WEEK}; HttpOnly; Secure; SameSite=Strict`,
  });
}

export function logout() {
  return json({ ok: true }, 200, {
    "set-cookie": `${COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  });
}
