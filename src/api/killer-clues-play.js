// POST /api/killer-clues/play
// { visitor, case, date, status, hints, guesses, seconds }
//
// Records how one anonymous browser got on with one case. Sent when a case
// is opened, when it's finished, and when the tab is hidden, so time spent
// keeps counting. A finished game is never turned back into "playing".

import { ensureTables, dayIndex } from "../killer-clues.js";
import { json } from "../visitors.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["playing", "solved", "gaveup"];
const clamp = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }

  const { visitor, date, status } = body ?? {};
  if (typeof visitor !== "string" || !UUID.test(visitor)) return json({ error: "Bad visitor." }, 400);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "Bad date." }, 400);
  if (!STATUSES.includes(status)) return json({ error: "Bad status." }, 400);
  const caseNo = dayIndex(date) + 1;
  if (caseNo < 1 || Number(body.case) !== caseNo) return json({ error: "Bad case." }, 400);

  const now = Date.now();
  await ensureTables(env.DB);
  await env.DB.prepare(`
    INSERT INTO kc_plays (visitor, case_no, day, status, hints, guesses, seconds, started_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
    ON CONFLICT (visitor, case_no) DO UPDATE SET
      status = CASE WHEN kc_plays.status = 'playing' THEN excluded.status ELSE kc_plays.status END,
      hints = MAX(kc_plays.hints, excluded.hints),
      guesses = MAX(kc_plays.guesses, excluded.guesses),
      seconds = MAX(kc_plays.seconds, excluded.seconds),
      updated_at = excluded.updated_at
  `)
    .bind(visitor.toLowerCase(), caseNo, date, status, clamp(body.hints, 3), clamp(body.guesses, 500), clamp(body.seconds, 6 * 3600), now)
    .run();

  return json({ ok: true });
}
