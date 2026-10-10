// POST /api/visit  { id: "<uuid>" }
//
// Sent once a day by each browser. Records the day it came by, and the day
// it first showed up. Repeats on the same day change nothing.

import { ensureTable, utcDay, json } from "../visitors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "No database bound." }, 503);

  let id;
  try {
    ({ id } = await request.json());
  } catch {}
  if (typeof id !== "string" || !UUID.test(id)) {
    return json({ error: "Send { id: <uuid> }" }, 400);
  }

  await ensureTable(env.DB);
  const visitor = id.toLowerCase();
  const day = utcDay();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO visitors (id, first_day) VALUES (?, ?)").bind(visitor, day),
    env.DB.prepare("INSERT OR IGNORE INTO daily_visits (id, day) VALUES (?, ?)").bind(visitor, day),
  ]);
  return json({ ok: true });
}
