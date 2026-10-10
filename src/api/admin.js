// Admin API. Everything except login needs a valid admin cookie.
//
//   POST /api/admin/login     { password }
//   POST /api/admin/logout
//   GET  /api/admin/stats     site visitors + Killer Clues play stats
//   GET  /api/admin/cases     every Killer Clues case, with its results
//   POST /api/admin/cases     { action: "add" | "update" | "move" | "delete", ... }

import { isAdmin, login, logout } from "../admin.js";
import { ensureTable, utcDay, json } from "../visitors.js";
import {
  ensureTables, allCases, cleanCase, addCase, updateCase, moveCase, deleteCase,
  dayIndex, dateFor, lockedThrough, TYPES,
} from "../killer-clues.js";

const DAY = 86_400_000;

export const loginRoute = { onRequestPost: ({ request, env }) => login(request, env) };
export const logoutRoute = { onRequestPost: () => logout() };

const guarded = (handler) => async (ctx) =>
  (await isAdmin(ctx.request, ctx.env)) ? handler(ctx) : json({ error: "Sign in first." }, 401);

export const statsRoute = {
  onRequestGet: guarded(async ({ env }) => {
    await ensureTables(env.DB);
    return json({ visitors: await visitorStats(env.DB), killerClues: await playStats(env.DB) });
  }),
};

export const casesRoute = {
  onRequestGet: guarded(async ({ env }) => json(await caseList(env.DB))),

  onRequestPost: guarded(async ({ request, env }) => {
    await ensureTables(env.DB);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Send JSON." }, 400);
    }
    const day = Number(body.day);
    let result = { ok: true };

    if (body.action === "add" || body.action === "update") {
      const { case: c, error } = cleanCase(body.case ?? {});
      if (error) return json({ error }, 400);
      if (body.action === "add") await addCase(env.DB, c);
      else await updateCase(env.DB, day, c);
    } else if (body.action === "move") {
      result = await moveCase(env.DB, day, body.direction === "up" ? "up" : "down");
    } else if (body.action === "delete") {
      result = await deleteCase(env.DB, day);
    } else {
      return json({ error: "Unknown action." }, 400);
    }

    if (result.error) return json(result, 409);
    return json(await caseList(env.DB));
  }),
};

// ---- Site visitors ----

async function visitorStats(db) {
  await ensureTable(db);
  const days = lastDays(30);
  const since = (n) => days[days.length - n];
  const [{ results }, everyone, week, month] = await Promise.all([
    db.prepare("SELECT day, COUNT(*) AS n FROM daily_visits WHERE day >= ? GROUP BY day").bind(days[0]).all(),
    db.prepare("SELECT COUNT(*) AS n FROM visitors").first(),
    db.prepare("SELECT COUNT(DISTINCT id) AS n FROM daily_visits WHERE day >= ?").bind(since(7)).first(),
    db.prepare("SELECT COUNT(DISTINCT id) AS n FROM daily_visits WHERE day >= ?").bind(since(30)).first(),
  ]);
  const perDay = new Map(results.map((r) => [r.day, r.n]));
  const series = days.map((day) => ({ day, n: perDay.get(day) ?? 0 }));
  return { total: everyone.n, today: series.at(-1).n, week: week.n, month: month.n, days: series };
}

// ---- Killer Clues plays ----

async function playStats(db) {
  const overall = await db.prepare(`
    SELECT
      COUNT(*) AS plays,
      COUNT(DISTINCT visitor) AS players,
      SUM(status = 'solved') AS solved,
      SUM(status = 'gaveup') AS gaveUp,
      SUM(status = 'playing') AS unfinished,
      AVG(CASE WHEN status = 'solved' THEN seconds END) AS avgSolveSeconds,
      AVG(CASE WHEN status = 'solved' THEN hints END) AS avgHints,
      AVG(CASE WHEN status != 'playing' THEN guesses END) AS avgGuesses
    FROM kc_plays
  `).first();

  const { results: hintRows } = await db
    .prepare("SELECT hints, COUNT(*) AS n FROM kc_plays WHERE status = 'solved' GROUP BY hints")
    .all();
  const ranks = { "Chief Inspector": 0, Inspector: 0, Sergeant: 0, Constable: 0, "Case gone cold": overall.gaveUp ?? 0 };
  const names = Object.keys(ranks);
  for (const r of hintRows) ranks[names[r.hints]] = r.n;

  const { results: dayRows } = await db.prepare("SELECT day, COUNT(*) AS n FROM kc_plays GROUP BY day").all();
  const perDay = new Map(dayRows.map((r) => [r.day, r.n]));
  const days = lastDays(30).map((day) => ({ day, n: perDay.get(day) ?? 0 }));

  return { ...overall, ranks, days };
}

async function caseResults(db) {
  const { results } = await db.prepare(`
    SELECT
      case_no,
      COUNT(*) AS plays,
      SUM(status = 'solved') AS solved,
      SUM(status = 'gaveup') AS gaveUp,
      AVG(CASE WHEN status = 'solved' THEN seconds END) AS avgSolveSeconds,
      AVG(CASE WHEN status = 'solved' THEN hints END) AS avgHints
    FROM kc_plays GROUP BY case_no
  `).all();
  return new Map(results.map((r) => [r.case_no, r]));
}

async function caseList(db) {
  await ensureTables(db);
  const [cases, results] = await Promise.all([allCases(db), caseResults(db)]);
  const today = dayIndex(utcDay());
  const last = cases.length ? cases[cases.length - 1].day : -1;
  return {
    today,
    lockedThrough: lockedThrough(),
    daysCovered: Math.max(0, last - today),
    types: TYPES,
    cases: cases.map((c) => ({
      ...c,
      date: dateFor(c.day),
      caseNo: c.day + 1,
      results: results.get(c.day + 1) ?? null,
    })),
  };
}

function lastDays(n) {
  const today = Date.parse(`${utcDay()}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => utcDay(today - (n - 1 - i) * DAY));
}
