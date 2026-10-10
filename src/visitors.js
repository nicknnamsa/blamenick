// Shared bits for the visitor counter. Each browser gets a random id the
// first time it visits, and checks in once per (UTC) day after that.
// No IPs, no cookies, nothing personal: just "this browser came by today".
//
//   visitors      one row per browser, with the day it first came
//   daily_visits  one row per browser per day it came

let ready = null;

export function ensureTable(db) {
  ready ??= db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, first_day TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS daily_visits (id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (id, day))"),
    // Before daily check-ins existed we only knew each browser's first day.
    db.prepare("INSERT OR IGNORE INTO daily_visits (id, day) SELECT id, first_day FROM visitors"),
  ]).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
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
