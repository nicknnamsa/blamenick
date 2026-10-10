// GET /api/popularity
//
// How many different people came by on each day (UTC), from the first
// visitor up to today, plus the all-time total. Quiet days are filled in
// with zeros so the chart has one bar per day.

import { ensureTable, utcDay, json } from "../visitors.js";

const DAY = 86_400_000;

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "No database bound." }, 503);

  await ensureTable(env.DB);
  const [{ results: perDay }, { results: firsts }, everyone] = await Promise.all([
    env.DB.prepare("SELECT day, COUNT(*) AS n FROM daily_visits GROUP BY day ORDER BY day").all(),
    env.DB.prepare("SELECT first_day AS day, COUNT(*) AS n FROM visitors GROUP BY first_day").all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM visitors").first(),
  ]);

  const people = new Map(perDay.map((r) => [r.day, r.n]));
  const fresh = new Map(firsts.map((r) => [r.day, r.n]));
  const days = [];
  if (perDay.length) {
    const end = Date.parse(`${utcDay()}T00:00:00Z`);
    for (let t = Date.parse(`${perDay[0].day}T00:00:00Z`); t <= end; t += DAY) {
      const day = utcDay(t);
      days.push({ day, people: people.get(day) ?? 0, new: fresh.get(day) ?? 0 });
    }
  }

  return json({ total: everyone.n, days }, 200, { "cache-control": "public, max-age=60" });
}
