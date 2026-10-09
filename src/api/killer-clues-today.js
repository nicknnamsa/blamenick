// GET /api/killer-clues/today?date=YYYY-MM-DD
//
// The browser sends its own local date, so a new case arrives at the
// player's midnight. Only dates that are "today" somewhere on Earth
// (UTC-12 to UTC+14) are allowed, so nobody can ask for next week's case.

import { clues, START_DATE } from "../../data/killer-clues.js";

const DAY = 86_400_000;

export function onRequestGet({ request }) {
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

  const dayIndex = Math.round((asked - Date.parse(`${START_DATE}T00:00:00Z`)) / DAY);
  if (dayIndex < 0) {
    return json({ error: "The first case opens soon." }, 404);
  }

  const record = clues[dayIndex % clues.length];
  return json({ case: dayIndex + 1, date, length: record.answer.length, ...record });
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
