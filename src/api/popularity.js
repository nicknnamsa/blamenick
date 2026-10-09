// GET /api/popularity
//
// How many different people have visited, day by day (UTC), from the first
// visitor up to today. Days with no new visitors are filled in, so the
// chart has one point per day.

import { ensureTable, utcDay, json } from "../visitors.js";

const DAY = 86_400_000;

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "No database bound." }, 503);

  await ensureTable(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT first_day AS day, COUNT(*) AS n FROM visitors GROUP BY first_day ORDER BY first_day"
  ).all();

  const newOn = new Map(results.map((r) => [r.day, r.n]));
  const days = [];
  if (results.length) {
    const end = Date.parse(`${utcDay()}T00:00:00Z`);
    let total = 0;
    for (let t = Date.parse(`${results[0].day}T00:00:00Z`); t <= end; t += DAY) {
      const day = utcDay(t);
      const fresh = newOn.get(day) ?? 0;
      total += fresh;
      days.push({ day, new: fresh, total });
    }
  }

  return json({ days }, 200, { "cache-control": "public, max-age=60" });
}
