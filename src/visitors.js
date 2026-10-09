// Shared bits for the visitor counter. Each browser gets a random id the
// first time it visits, and we store that id with the day it first came.
// No IPs, no cookies, nothing personal: just "a new person turned up today".

export async function ensureTable(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, first_day TEXT NOT NULL)"
  ).run();
}

export function utcDay(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}
