// GET /api/killer-clues/today?date=YYYY-MM-DD
//
// The browser sends its own local date, so a new case arrives at the
// player's midnight. Only dates that are "today" somewhere on Earth
// (UTC-12 to UTC+14) are allowed, so nobody can ask for next week's case.

import { ensureTables, caseForDay, dayIndex } from "../killer-clues.js";

const DAY = 86_400_000;

export async function onRequestGet({ request, env }) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: "Send ?date=YYYY-MM-DD" }, 400);
  }

  const asked = Date.parse(`${date}T00:00:00Z`);
  const now = Date.now();
  const earliest = startOfUtcDay(now - 12 * 3_600_000);
  const latest = startOfUtcDay(now + 14 * 3_600_000);
  if (Number.isNaN(asked) || asked < earliest || asked > latest) {
    return json({ error: "That case isn't open yet." }, 403);
  }

  const index = dayIndex(date);
  if (index < 0) {
    return json({ error: "The first case opens soon." }, 404);
  }

  await ensureTables(env.DB);
  const record = await caseForDay(env.DB, index);
  if (!record) return json({ error: "No cases written yet." }, 404);
  const { day, replay, ...rest } = record;
  return json({ case: index + 1, date, length: record.answer.length, ...rest });
}

function startOfUtcDay(ms) {
  return Math.floor(ms / DAY) * DAY;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
