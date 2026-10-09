// POST /api/visit  { id: "<uuid>" }
//
// Records a browser the first time it shows up. Sending the same id again
// does nothing, so each browser is only ever counted once.

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
  await env.DB.prepare("INSERT OR IGNORE INTO visitors (id, first_day) VALUES (?, ?)")
    .bind(id.toLowerCase(), utcDay())
    .run();
  return json({ ok: true });
}
